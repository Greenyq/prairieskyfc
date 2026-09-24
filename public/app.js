
const STORAGE_KEY = "psfc_players_v2";
const PAYMENTS_KEY = "psfc_payments_v1";

const seedPlayers = [
  {
    id: crypto.randomUUID(),
    name: "Michaela",
    birthYear: 2013,
    parent: "Kelly",
    email: "",
    group: "Unassigned",
    status: "Trial booked",
    trialDate: "",
    october: "Trial",
    fee: 150,
    payment: "Not due",
    notes: "Parent asked to come for a free trial in October.",
    lastContact: "2026-09-24"
  },
  {
    id: crypto.randomUUID(),
    name: "Denis family player",
    birthYear: "",
    parent: "Denis Mazaev",
    email: "",
    group: "Foundation",
    status: "Joined",
    trialDate: "",
    october: "Joined",
    fee: 150,
    payment: "Unpaid",
    notes: "Family said they want to join from October.",
    lastContact: "2026-09-24"
  }
];

let players = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || seedPlayers;
let payments = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || "null") || [];

function monthFromDate(dateString) {
  if (!dateString) return "Unknown";
  const d = new Date(dateString + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-US", { month: "long" });
}

// Migrate Gmail-imported payments that were previously hard-coded as October.
let migratedPaymentMonths = false;
payments = payments.map(function(p) {
  if (p.messageId && p.date) {
    const correctMonth = monthFromDate(p.date);
    if (correctMonth !== "Unknown" && p.month !== correctMonth) {
      migratedPaymentMonths = true;
      return { ...p, month: correctMonth };
    }
  }
  return p;
});
if (migratedPaymentMonths) {
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
}

function $(s) { return document.querySelector(s); }

function esc(v) {
  return String(v || "").replace(/[&<>"']/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c];
  });
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
  renderAll();
}

function ageFromYear(y) {
  const n = Number(y);
  return n ? String(2026 - n) + " / " + String(n) : "—";
}

function badge(value) {
  const cls = String(value).toLowerCase().replaceAll(" ", "");
  return '<span class="badge ' + cls + '">' + esc(value) + '</span>';
}

function renderDashboard() {
  const joined = players.filter(function(p){ return p.status === "Joined"; }).length;
  const paid = players.filter(function(p){ return p.payment === "Paid"; }).length;
  const trials = players.filter(function(p){ return ["Trial booked","Trial attended"].includes(p.status); }).length;
  const waiting = players.filter(function(p){ return ["Invited","No response"].includes(p.status); }).length;

  const cards = [["Players", players.length], ["Joined", joined], ["Paid", paid], ["October trials", trials], ["Waiting reply", waiting]];
  $("#cards").innerHTML = cards.map(function(item){
    return '<div class="card"><span>' + item[0] + '</span><b>' + item[1] + '</b></div>';
  }).join("");

  const stages = [
    ["Invited", players.filter(function(p){ return p.status === "Invited"; }).length],
    ["Trial booked", players.filter(function(p){ return p.status === "Trial booked"; }).length],
    ["Attended", players.filter(function(p){ return p.status === "Trial attended"; }).length],
    ["Joined", joined]
  ];
  $("#pipeline").innerHTML = stages.map(function(item){
    return '<div><b>' + item[0] + '</b><span>' + item[1] + '</span></div>';
  }).join("");

  const groups = ["Foundation","Performance","Girls","Unassigned"];
  $("#groupSummary").innerHTML = groups.map(function(g){
    const count = players.filter(function(p){ return p.group === g; }).length;
    return '<div><b>' + g + '</b><span>' + count + ' players</span></div>';
  }).join("");

  const attention = players.filter(function(p){
    return p.status === "No response" || (p.status === "Joined" && p.payment === "Unpaid");
  });

  $("#attention").innerHTML = attention.length ? attention.map(function(p){
    const msg = p.status === "No response" ? "Follow up with parent" : "October payment outstanding";
    return '<div class="attention-row"><div><b>' + esc(p.name) + '</b><div><span>' + msg + '</span></div></div><span>' + esc(p.parent || "") + '</span></div>';
  }).join("") : '<div class="empty">Nothing urgent right now.</div>';
}

function renderPlayers() {
  const q = $("#playerSearch").value.toLowerCase().trim();
  const gf = $("#groupFilter").value;
  const rows = players.filter(function(p){
    const hay = (p.name + " " + p.parent + " " + p.email).toLowerCase();
    return (!q || hay.includes(q)) && (!gf || p.group === gf);
  });

  $("#playersTable").innerHTML = rows.map(function(p){
    return '<tr>' +
      '<td class="name-cell"><b>' + esc(p.name) + '</b><span>' + esc(p.email || "") + '</span></td>' +
      '<td>' + ageFromYear(p.birthYear) + '</td>' +
      '<td>' + esc(p.parent || "—") + '</td>' +
      '<td>' + esc(p.group) + '</td>' +
      '<td>' + badge(p.status) + '</td>' +
      '<td>' + badge(p.october) + '</td>' +
      '<td>' + badge(p.payment) + '</td>' +
      '<td><button class="icon-btn edit-player" data-id="' + p.id + '">Edit</button></td>' +
      '</tr>';
  }).join("") || '<tr><td colspan="8" class="empty">No players found.</td></tr>';
}

function renderLeads() {
  const leads = players.filter(function(p){ return p.status !== "Joined" && p.status !== "Declined"; });
  $("#leadsTable").innerHTML = leads.map(function(p){
    let action = "—";
    if (p.status === "No response") action = "Follow up";
    if (p.status === "Invited") action = "Waiting reply";
    if (p.status === "Trial booked") action = "Prepare trial";
    if (p.status === "Trial attended") action = "Ask for decision";
    return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.parent || "—") + '</td><td>' +
      badge(p.status) + '</td><td>' + esc(p.trialDate || "Not set") + '</td><td>' +
      esc(p.lastContact || "—") + '</td><td>' + action + '</td></tr>';
  }).join("") || '<tr><td colspan="6" class="empty">No active leads.</td></tr>';
}

function playersCovered(amount) {
  const a = Number(amount);
  if (a === 300) return 2;
  if (a === 150 || a === 100) return 1;
  if (a > 0 && a % 150 === 0) return a / 150;
  return 1;
}

function renderPayments() {
  const october = payments.filter(function(p){ return p.month === "October"; });
  const total = october.reduce(function(s,p){ return s + Number(p.amount); }, 0);
  const spots = october.reduce(function(s,p){ return s + Number(p.playersCovered); }, 0);
  $("#paymentSummary").innerHTML = "$" + total.toLocaleString() + '<small>' + spots + ' paid player spot' + (spots === 1 ? '' : 's') + ' recorded for October</small>';

  $("#paymentsTable").innerHTML = payments.slice().reverse().map(function(p){
    return '<tr><td>' + esc(p.date) + '</td><td>' + esc(p.payer) + '</td><td>$' +
      Number(p.amount).toFixed(0) + '</td><td>' + p.playersCovered + '</td><td>' + esc(p.month) + '</td></tr>';
  }).join("") || '<tr><td colspan="5" class="empty">No payments recorded yet.</td></tr>';
}

function renderAll() {
  renderDashboard();
  renderPlayers();
  renderLeads();
  renderPayments();
}

function openModal(p) {
  p = p || null;
  $("#playerModal").classList.add("open");
  $("#modalTitle").textContent = p ? "Edit player" : "Add player";
  $("#editId").value = p ? p.id : "";
  $("#playerName").value = p ? p.name : "";
  $("#birthYear").value = p ? p.birthYear : "";
  $("#parentName").value = p ? p.parent : "";
  $("#parentEmail").value = p ? p.email : "";
  $("#playerGroup").value = p ? p.group : "Unassigned";
  $("#playerStatus").value = p ? p.status : "Lead";
  $("#trialDate").value = p ? p.trialDate : "";
  $("#octoberStatus").value = p ? p.october : "Pending";
  $("#monthlyFee").value = p ? p.fee : 150;
  $("#paymentStatus").value = p ? p.payment : "Unpaid";
  $("#notes").value = p ? p.notes : "";
}

function closeModal() {
  $("#playerModal").classList.remove("open");
}

document.addEventListener("click", function(e){
  const nav = e.target.closest(".nav");
  if (nav) {
    document.querySelectorAll(".nav").forEach(function(n){ n.classList.remove("active"); });
    nav.classList.add("active");
    document.querySelectorAll(".view").forEach(function(v){ v.classList.remove("active"); });
    $("#" + nav.dataset.view + "View").classList.add("active");

    const titles = {
      dashboard:["Club Dashboard","Your internal academy cockpit"],
      players:["Players","Roster, groups and payment status"],
      leads:["Trials & Leads","Who was invited, who replied and who needs follow-up"],
      payments:["Payments","Track monthly collection and family payments"],
      gmail:["Inbox Intelligence","Sync leads, replies and Interac payments from Gmail"]
    };
    $("#pageTitle").textContent = titles[nav.dataset.view][0];
    $("#pageSub").textContent = titles[nav.dataset.view][1];
  }

  const edit = e.target.closest(".edit-player");
  if (edit) {
    const p = players.find(function(x){ return x.id === edit.dataset.id; });
    if (p) openModal(p);
  }
});

$("#addPlayerBtn").onclick = function(){ openModal(); };
$("#closeModal").onclick = closeModal;
$("#cancelModal").onclick = closeModal;
$("#playerSearch").oninput = renderPlayers;
$("#groupFilter").onchange = renderPlayers;

$("#playerForm").onsubmit = function(e){
  e.preventDefault();
  const id = $("#editId").value || crypto.randomUUID();
  const existing = players.find(function(p){ return p.id === id; });

  const record = {
    id:id,
    name:$("#playerName").value.trim(),
    birthYear:$("#birthYear").value,
    parent:$("#parentName").value.trim(),
    email:$("#parentEmail").value.trim(),
    group:$("#playerGroup").value,
    status:$("#playerStatus").value,
    trialDate:$("#trialDate").value,
    october:$("#octoberStatus").value,
    fee:Number($("#monthlyFee").value || 150),
    payment:$("#paymentStatus").value,
    notes:$("#notes").value.trim(),
    lastContact: existing ? existing.lastContact : new Date().toISOString().slice(0,10)
  };

  players = existing ? players.map(function(p){ return p.id === id ? record : p; }) : players.concat([record]);
  closeModal();
  save();
};

$("#paymentForm").onsubmit = function(e){
  e.preventDefault();
  const amount = Number($("#amount").value);
  payments.push({
    id:crypto.randomUUID(),
    date:new Date().toISOString().slice(0,10),
    payer:$("#payer").value.trim(),
    amount:amount,
    playersCovered:playersCovered(amount),
    month:$("#paymentMonth").value
  });
  e.target.reset();
  save();
};

renderAll();


async function loadGmailStatus() {
  try {
    const r = await fetch("/api/gmail/status");
    const s = await r.json();
    const side = $("#gmailSidebarStatus");
    const txt = $("#gmailStatusText");
    const connect = $("#connectGmail");
    const sync = $("#syncGmail");
    const disconnect = $("#disconnectGmail");

    if (!s.configured) {
      side.innerHTML = '<span class="dot"></span> Gmail: setup required';
      txt.textContent = "Google OAuth not configured";
      connect.style.display = "none";
      sync.disabled = true;
      disconnect.style.display = "none";
      return;
    }

    if (s.mode === "apps-script") {
      connect.style.display = "none";
      disconnect.style.display = "none";
      sync.disabled = false;
      sync.textContent = "Load latest Gmail sync";
      if (s.connected) {
        side.innerHTML = '<span class="dot connected"></span> Gmail sync active';
        txt.textContent = "Apps Script connected · " + (s.lastSync ? "last sync " + new Date(s.lastSync).toLocaleString() : "");
      } else {
        side.innerHTML = '<span class="dot"></span> Gmail sync ready';
        txt.textContent = "Apps Script ready · run the script once";
      }
      return;
    }

    if (s.connected) {
      side.innerHTML = '<span class="dot connected"></span> Gmail connected';
      txt.textContent = "Connected: " + (s.email || "Gmail");
      connect.style.display = "none";
      sync.disabled = false;
      disconnect.style.display = "inline-block";
    } else {
      side.innerHTML = '<span class="dot"></span> Gmail not connected';
      txt.textContent = "Ready to connect";
      connect.style.display = "inline-block";
      sync.disabled = true;
      disconnect.style.display = "none";
    }
  } catch (e) {
    $("#gmailStatusText").textContent = "Status check failed";
  }
}

function renderGmailLeads(items) {
  $("#gmailLeads").innerHTML = (items || []).map(function(x, i){
    return '<tr><td><b>' + esc(x.playerName) + '</b></td><td>' + esc(x.birthYear || "—") + '</td><td>' +
      esc(x.parent) + '<div class="muted small">' + esc(x.email) + '</div></td><td>' + badge(x.status) +
      '</td><td>' + esc(x.lastContact) + '</td><td>' + esc(x.subject || "") +
      '</td><td><button class="icon-btn import-lead" data-i="' + i + '">Add</button></td></tr>';
  }).join("") || '<tr><td colspan="7" class="empty">Run Gmail sync to detect leads.</td></tr>';
}

function renderGmailPayments(items) {
  $("#gmailPayments").innerHTML = (items || []).map(function(x, i){
    return '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.payer) + '</td><td>$' +
      Number(x.amount).toFixed(0) + '</td><td><b>' + x.playersCovered + '</b></td><td>' +
      esc(x.confidence) + '</td><td>' + esc(x.subject || "") +
      '</td><td><button class="icon-btn import-payment" data-i="' + i + '">Add</button></td></tr>';
  }).join("") || '<tr><td colspan="7" class="empty">Run Gmail sync to detect payments.</td></tr>';
}

let lastGmailSync = { leads: [], payments: [] };

async function runGmailSync() {
  const btn = $("#syncGmail");
  const result = $("#syncResult");
  btn.disabled = true;
  btn.textContent = "Syncing…";
  result.textContent = "Reading Gmail. This can take a little while.";

  try {
    const r = await fetch("/api/gmail/sync", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ max: 250 })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Sync failed");
    lastGmailSync = data;
    renderGmailLeads(data.leads);
    renderGmailPayments(data.payments);
    result.textContent = "Scanned " + data.scanned + " emails · " + data.leads.length +
      " lead threads · " + data.payments.length + " payment emails";
  } catch (e) {
    result.textContent = "Sync error: " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Load latest Gmail sync";
  }
}

$("#syncGmail").onclick = runGmailSync;
$("#disconnectGmail").onclick = async function(){
  await fetch("/api/gmail/disconnect", {method:"POST"});
  await loadGmailStatus();
};

renderGmailLeads([]);
renderGmailPayments([]);

document.addEventListener("click", function(e){
  const leadBtn = e.target.closest(".import-lead");
  if (leadBtn) {
    const x = lastGmailSync.leads[Number(leadBtn.dataset.i)];
    if (!x) return;
    const exists = players.find(function(p){
      return p.email && p.email.toLowerCase() === String(x.email).toLowerCase();
    });

    if (!exists) {
      players.push({
        id: crypto.randomUUID(),
        name: x.playerName,
        birthYear: x.birthYear || "",
        parent: x.parent || "",
        email: x.email || "",
        group: "Unassigned",
        status: x.status === "Waiting reply" ? "No response" : x.status,
        trialDate: "",
        october: /trial/i.test(x.status) ? "Trial" : (x.status === "Joined" ? "Joined" : "Pending"),
        fee: 150,
        payment: x.status === "Joined" ? "Unpaid" : "Not due",
        notes: "Imported from Gmail: " + (x.subject || ""),
        lastContact: x.lastContact || new Date().toISOString().slice(0,10)
      });
      save();
      leadBtn.textContent = "Added";
      leadBtn.disabled = true;
    } else {
      leadBtn.textContent = "Exists";
      leadBtn.disabled = true;
    }
  }

  const payBtn = e.target.closest(".import-payment");
  if (payBtn) {
    const x = lastGmailSync.payments[Number(payBtn.dataset.i)];
    if (!x) return;
    const exists = payments.find(function(p){ return p.messageId === x.messageId; });

    if (!exists) {
      payments.push({
        id: crypto.randomUUID(),
        messageId: x.messageId,
        date: x.date,
        payer: x.payer,
        amount: x.amount,
        playersCovered: x.playersCovered,
        month: monthFromDate(x.date)
      });
      save();
      payBtn.textContent = "Added";
      payBtn.disabled = true;
    } else {
      payBtn.textContent = "Exists";
      payBtn.disabled = true;
    }
  }
});

loadGmailStatus();
