import express from "express";
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "prairie-sky-manager" });
});

app.listen(port, () => {
  console.log("Prairie Sky Manager running on " + port);
});
