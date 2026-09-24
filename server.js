import express from "express";
import fs from "fs";
import { google } from "googleapis";

const app = express();
const port = process.env.PORT || 10000;
const APP_URL = process.env.APP_URL || "https://prairie-sky-manager.onrender.com";
const TOKEN_FILE = "/tmp/psfc-gmail-token.json";
const APPS_SCRIPT_SYNC_SECRET = process.env.APPS_SCRIPT_SYNC_SECRET || "";
let latestSync = { ok: true, scanned: 0, leads: [], payments: [], syncedAt: null, source: "apps-script" };

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

function oauthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function oauthClient() {
  const redirect = process.env.GOOGLE_REDIRECT_URI || APP_URL + "/auth/google/callback";
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirect
  );
}

function loadTokens() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); }
  catch { return null; }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens), "utf8");
}

function header(headers, name) {
  const h = (headers || []).find(x => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function decodePart(part) {
  if (!part) return "";
  if (part.body && part.body.data) {
    return Buffer.from(part.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  }
  if (part.parts) {
    return part.parts.map(decodePart).join("\n");
  }
  return "";
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddress(v) {
  const m = String(v || "").match(/^(.*?)<([^>]+)>$/);
  if (m) return { name: m[1].replace(/"/g, "").trim(), email: m[2].trim().toLowerCase() };
  return { name: String(v || "").split("@")[0].trim(), email: String(v || "").trim().toLowerCase() };
}

function amountFromText(text) {
  const patterns = [
    /(?:CAD|\$)\s*([0-9]{2,4}(?:\.\d{2})?)/i,
    /([0-9]{2,4}(?:\.\d{2})?)\s*(?:CAD|dollars?)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return Number(m[1]);
  }
  return null;
}

function playersCovered(amount) {
  if (amount === 300) return 2;
  if (amount === 150 || amount === 100) return 1;
  if (amount > 0 && amount % 150 === 0) return amount / 150;
  return 1;
}

function inferBirthYear(text) {
  const year = text.match(/\b(20(?:0[8-9]|1[0-9]|2[0-2]))\b/);
  if (year) return Number(year[1]);
  const age = text.match(/\b(?:age|aged|is|turning)\s*(\d{1,2})\b/i);
  if (age) {
    const n = Number(age[1]);
    if (n >= 4 && n <= 18) return 2026 - n;
  }
  return null;
}

function inferChildName(text) {
  const patterns = [
    /my\s+(?:son|daughter|child)\s+([A-Z][a-zA-Z'-]{1,20})/i,
    /(?:son|daughter|child)[,:]?\s+([A-Z][a-zA-Z'-]{1,20})/i,
    /([A-Z][a-zA-Z'-]{1,20})\s+is\s+\d{1,2}\s*(?:years?|yrs?)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return "";
}

function inferStatus(messages, clubEmail) {
  const sorted = messages.slice().sort((a,b) => a.ts - b.ts);
  const latest = sorted[sorted.length - 1];
  const all = sorted.map(x => (x.subject + " " + x.body).toLowerCase()).join(" ");
  if (/would love to join|want to join|ready to register|register|continue with us|continue training/.test(all)) return "Joined";
  if (/trial|tryout|free session|come out and try|free practice/.test(all)) {
    if (latest && latest.fromEmail !== clubEmail) return "Trial booked";
    return "Invited";
  }
  if (latest && latest.fromEmail === clubEmail) return "Waiting reply";
  return "Lead";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "prairie-sky-manager" });
});

app.get("/api/gmail/status", async (_req, res) => {
  if (APPS_SCRIPT_SYNC_SECRET) {
    return res.json({
      configured: true,
      connected: Boolean(latestSync.syncedAt),
      mode: "apps-script",
      email: "info@prairieskyfc.ca",
      lastSync: latestSync.syncedAt
    });
  }
  const tokens = loadTokens();
  if (!oauthConfigured()) {
    return res.json({ configured: false, connected: false, reason: "Missing Google OAuth environment variables" });
  }
  if (!tokens) return res.json({ configured: true, connected: false });
  try {
    const auth = oauthClient();
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const me = await oauth2.userinfo.get();
    res.json({ configured: true, connected: true, email: me.data.email || "" });
  } catch (e) {
    res.json({ configured: true, connected: false, reason: e.message });
  }
});

app.get("/auth/google", (req, res) => {
  if (!oauthConfigured()) return res.status(503).send("Google OAuth is not configured on Render yet.");
  const auth = oauthClient();
  const url = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email"
    ]
  });
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const auth = oauthClient();
    const { tokens } = await auth.getToken(String(req.query.code || ""));
    saveTokens(tokens);
    res.redirect("/?gmail=connected");
  } catch (e) {
    res.status(500).send("Gmail connection failed: " + e.message);
  }
});

app.post("/api/gmail/disconnect", (_req, res) => {
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
  res.json({ ok: true });
});

app.post("/api/gmail/sync", async (req, res) => {
  if (APPS_SCRIPT_SYNC_SECRET) {
    return res.json(latestSync);
  }
  try {
    const tokens = loadTokens();
    if (!oauthConfigured()) return res.status(503).json({ error: "Google OAuth is not configured." });
    if (!tokens) return res.status(401).json({ error: "Gmail is not connected." });

    const auth = oauthClient();
    auth.setCredentials(tokens);
    auth.on("tokens", t => saveTokens({ ...tokens, ...t }));

    const gmail = google.gmail({ version: "v1", auth });
    const clubEmail = "info@prairieskyfc.ca";
    const query = String(req.body?.query || "newer_than:180d -in:spam -in:trash");
    const max = Math.min(Number(req.body?.max || 250), 500);

    const listed = await gmail.users.messages.list({ userId: "me", q: query, maxResults: max });
    const ids = (listed.data.messages || []).map(x => x.id).filter(Boolean);

    const raw = [];
    for (let i = 0; i < ids.length; i += 25) {
      const batch = ids.slice(i, i + 25);
      const got = await Promise.all(batch.map(id => gmail.users.messages.get({
        userId: "me", id, format: "full"
      })));
      for (const g of got) {
        const payload = g.data.payload || {};
        const headers = payload.headers || [];
        const from = parseAddress(header(headers, "From"));
        const to = header(headers, "To").toLowerCase();
        const subject = header(headers, "Subject");
        const body = stripHtml(decodePart(payload));
        raw.push({
          id: g.data.id,
          threadId: g.data.threadId,
          fromName: from.name,
          fromEmail: from.email,
          to,
          subject,
          body,
          ts: Number(g.data.internalDate || 0)
        });
      }
    }

    const payments = [];
    for (const m of raw) {
      const hay = (m.subject + " " + m.body).toLowerCase();
      const looksPayment = /interac|e-transfer|etransfer|money transfer|deposit|payment received|sent you money/.test(hay);
      if (!looksPayment) continue;
      const amount = amountFromText(m.subject + " " + m.body);
      if (!amount) continue;
      payments.push({
        messageId: m.id,
        date: new Date(m.ts).toISOString().slice(0,10),
        payer: m.fromName || m.fromEmail,
        payerEmail: m.fromEmail,
        amount,
        playersCovered: playersCovered(amount),
        confidence: amount === 150 || amount === 300 ? "high" : "review",
        subject: m.subject
      });
    }

    const byThread = new Map();
    for (const m of raw) {
      if (!byThread.has(m.threadId)) byThread.set(m.threadId, []);
      byThread.get(m.threadId).push(m);
    }

    const leads = [];
    for (const [threadId, msgs] of byThread.entries()) {
      const external = msgs.filter(m => m.fromEmail && m.fromEmail !== clubEmail);
      if (!external.length) continue;
      const combined = msgs.map(m => m.subject + " " + m.body).join(" ");
      const relevant = /soccer|football|academy|training|practice|trial|tryout|son|daughter|player|age|born|register/.test(combined.toLowerCase());
      if (!relevant) continue;
      const latestExternal = external.sort((a,b)=>b.ts-a.ts)[0];
      const birthYear = inferBirthYear(combined);
      const childName = inferChildName(combined);
      const status = inferStatus(msgs, clubEmail);
      const last = msgs.slice().sort((a,b)=>b.ts-a.ts)[0];
      leads.push({
        threadId,
        playerName: childName || "Unknown player",
        birthYear,
        parent: latestExternal.fromName || latestExternal.fromEmail,
        email: latestExternal.fromEmail,
        status,
        lastContact: new Date(last.ts).toISOString().slice(0,10),
        subject: last.subject,
        needsReview: !childName || !birthYear
      });
    }

    leads.sort((a,b)=>String(b.lastContact).localeCompare(String(a.lastContact)));
    payments.sort((a,b)=>String(b.date).localeCompare(String(a.date)));

    res.json({
      ok: true,
      scanned: raw.length,
      leads,
      payments,
      rules: { "150": 1, "300": 2 }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


app.post("/api/apps-script-sync", (req, res) => {
  try {
    if (!APPS_SCRIPT_SYNC_SECRET) {
      return res.status(503).json({ error: "Apps Script sync is not configured." });
    }
    const provided = String(req.body?.secret || "");
    if (provided !== APPS_SCRIPT_SYNC_SECRET) {
      return res.status(401).json({ error: "Invalid sync secret." });
    }

    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const clubEmail = "info@prairieskyfc.ca";

    const payments = [];
    for (const m of raw) {
      const hay = ((m.subject || "") + " " + (m.body || "")).toLowerCase();
      const looksPayment = /interac|e-transfer|etransfer|money transfer|deposit|payment received|sent you money/.test(hay);
      if (!looksPayment) continue;
      const amount = amountFromText((m.subject || "") + " " + (m.body || ""));
      if (!amount) continue;
      payments.push({
        messageId: m.id || "",
        date: new Date(Number(m.ts || Date.now())).toISOString().slice(0,10),
        payer: m.fromName || m.fromEmail || "Unknown payer",
        payerEmail: m.fromEmail || "",
        amount,
        playersCovered: playersCovered(amount),
        confidence: amount === 150 || amount === 300 ? "high" : "review",
        subject: m.subject || ""
      });
    }

    const byThread = new Map();
    for (const m of raw) {
      const tid = m.threadId || m.id || crypto.randomUUID();
      if (!byThread.has(tid)) byThread.set(tid, []);
      byThread.get(tid).push(m);
    }

    const leads = [];
    for (const [threadId, msgs] of byThread.entries()) {
      const external = msgs.filter(m => m.fromEmail && String(m.fromEmail).toLowerCase() !== clubEmail);
      if (!external.length) continue;

      const combined = msgs.map(m => (m.subject || "") + " " + (m.body || "")).join(" ");
      const relevant = /soccer|football|academy|training|practice|trial|tryout|son|daughter|player|age|born|register/.test(combined.toLowerCase());
      if (!relevant) continue;

      const latestExternal = external.slice().sort((a,b)=>Number(b.ts||0)-Number(a.ts||0))[0];
      const birthYear = inferBirthYear(combined);
      const childName = inferChildName(combined);
      const status = inferStatus(msgs.map(m => ({
        subject: m.subject || "",
        body: m.body || "",
        fromEmail: String(m.fromEmail || "").toLowerCase(),
        ts: Number(m.ts || 0)
      })), clubEmail);
      const last = msgs.slice().sort((a,b)=>Number(b.ts||0)-Number(a.ts||0))[0];

      leads.push({
        threadId,
        playerName: childName || "Unknown player",
        birthYear,
        parent: latestExternal.fromName || latestExternal.fromEmail || "Unknown parent",
        email: latestExternal.fromEmail || "",
        status,
        lastContact: new Date(Number(last.ts || Date.now())).toISOString().slice(0,10),
        subject: last.subject || "",
        needsReview: !childName || !birthYear
      });
    }

    leads.sort((a,b)=>String(b.lastContact).localeCompare(String(a.lastContact)));
    payments.sort((a,b)=>String(b.date).localeCompare(String(a.date)));

    latestSync = {
      ok: true,
      scanned: raw.length,
      leads,
      payments,
      syncedAt: new Date().toISOString(),
      source: "apps-script",
      rules: { "150": 1, "300": 2 }
    };

    return res.json({
      ok: true,
      scanned: latestSync.scanned,
      leads: latestSync.leads.length,
      payments: latestSync.payments.length,
      syncedAt: latestSync.syncedAt
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(port, () => {
  console.log("Prairie Sky Manager running on " + port);
});
