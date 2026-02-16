const el = (id) => document.getElementById(id);

const ui = {
  token: el("token"),
  wsStatus: el("wsStatus"),
  connectBtn: el("connectBtn"),
  startBtn: el("startBtn"),
  stopBtn: el("stopBtn"),
  refreshBtn: el("refreshBtn"),
  kpis: el("kpis"),
  servicesBody: el("servicesBody"),
  systemSummary: el("systemSummary"),
  candidatesBody: el("candidatesBody"),
  assessmentBox: el("assessmentBox"),
  eventsList: el("eventsList"),
  alertsList: el("alertsList"),
  equityChart: el("equityChart"),
};

const state = {
  status: "STOPPED",
  analytics: null,
  vitals: null,
  latestSystemStatus: null,
  auth: null,
  supervisor: null,
  candidates: [],
  assessments: [],
  assessment: null,
  recentEvents: [],
  securityAlerts: [],
  vitalsHistory: [],
};

let ws = null;
let reconnectTimer = null;
let statePollTimer = null;

const persistedToken = localStorage.getItem("relay101.token");
if (persistedToken) ui.token.value = persistedToken;

function authHeader() {
  const token = ui.token.value.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function setWsStatus(label, level = "warn") {
  ui.wsStatus.textContent = label;
  ui.wsStatus.className = `status ${level}`;
}

function shortAddr(v) {
  const s = String(v ?? "");
  if (s.length <= 14) return s;
  return `${s.slice(0, 7)}...${s.slice(-5)}`;
}

function fmtNum(v, digits = 3) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.toLocaleTimeString()}`;
}

function sinceMs(ms) {
  if (!Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

async function post(path) {
  const res = await fetch(path, { method: "POST", headers: { ...authHeader() } });
  return res.json().catch(() => ({}));
}

async function fetchState() {
  const res = await fetch("/api/state", { headers: { ...authHeader() } });
  if (!res.ok) throw new Error(`state ${res.status}`);
  const data = await res.json();

  state.status = data.status;
  state.analytics = data.analytics;
  state.vitals = data.vitals;
  state.latestSystemStatus = data.latestSystemStatus;
  state.auth = data.auth;
  state.supervisor = data.supervisor;
  state.candidates = data.candidates || [];
  state.assessments = data.assessments || [];
  state.recentEvents = data.recentEvents || [];
  state.securityAlerts = data.securityAlerts || [];
  if (!state.assessment && state.assessments.length) state.assessment = state.assessments[0];
  pushVitals(data.vitals);
  render();
}

function pushVitals(v) {
  if (!v) return;
  state.vitalsHistory.push({ t: v.t || Date.now(), equity: Number(v.equity) || 0 });
  if (state.vitalsHistory.length > 160) state.vitalsHistory.shift();
}

function connectWs() {
  const token = ui.token.value.trim();
  if (!token) {
    setWsStatus("TOKEN REQUIRED", "bad");
    return;
  }

  localStorage.setItem("relay101.token", token);
  if (ws) ws.close();

  const url = `${location.origin.replace("http", "ws")}/ws/telemetry?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);
  setWsStatus("CONNECTING", "warn");

  ws.onopen = () => {
    setWsStatus("CONNECTED", "ok");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  ws.onclose = () => {
    setWsStatus("DISCONNECTED", "bad");
    scheduleReconnect();
  };

  ws.onerror = () => setWsStatus("ERROR", "bad");

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "analytics") state.analytics = msg.data;
    if (msg.type === "vitals") {
      state.vitals = msg.data;
      pushVitals(msg.data);
    }
    if (msg.type === "candidates") state.candidates = msg.data || [];
    if (msg.type === "events") state.recentEvents = msg.data || [];
    if (msg.type === "assessment") state.assessment = msg.data;
    if (msg.type === "system_status") state.latestSystemStatus = msg.data;
    if (msg.type === "security_alert") {
      state.securityAlerts.push(msg.data);
      state.securityAlerts = state.securityAlerts.slice(-120);
    }
    render();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs();
  }, 2000);
}

function renderKpis() {
  const analytics = state.analytics || {};
  const sys = state.latestSystemStatus || {};
  const cards = [
    { label: "Status", value: String(state.status || analytics.status || "-") },
    { label: "Uptime", value: `${analytics.uptimeSec || 0}s` },
    { label: "Equity (SOL)", value: fmtNum(analytics.equitySOL, 4) },
    { label: "PnL (SOL)", value: fmtNum(analytics.totalPnL_SOL, 4) },
    { label: "Events/sec", value: fmtNum(sys.eventRatePerSec, 2) },
    { label: "Unauthorized/min", value: String(sys.unauthorizedPerMin ?? state.auth?.unauthorizedPerMin ?? 0) },
  ];

  ui.kpis.innerHTML = cards
    .map((c) => `<article class="kpi"><div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div></article>`)
    .join("");
}

function renderServices() {
  const services = state.supervisor?.services || state.latestSystemStatus?.services || [];
  ui.servicesBody.innerHTML = services
    .map((s) => {
      const runningTag = s.running ? '<span class="tag ok">up</span>' : '<span class="tag bad">down</span>';
      const hb = s.lastHeartbeatAgeMs != null ? sinceMs(s.lastHeartbeatAgeMs) : "-";
      const err = s.lastError ? shortAddr(s.lastError) : "-";
      return `<tr><td>${esc(s.name)}</td><td>${runningTag}</td><td>${esc(hb)}</td><td>${esc(err)}</td></tr>`;
    })
    .join("");
}

function renderCandidates() {
  const rows = (state.candidates || [])
    .slice(0, 30)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((c) => {
      return `<tr>
        <td>${esc(c.symbol || shortAddr(c.mint))}</td>
        <td>${esc(fmtNum(c.score, 1))}</td>
        <td>${esc(fmtNum(c.velocity, 1))}</td>
        <td>${esc(fmtNum(c.solInflowPerMin, 2))}</td>
        <td>${esc(c.uniqueBuyers ?? "-")}</td>
        <td>${esc(fmtTs(c.ts))}</td>
      </tr>`;
    });
  ui.candidatesBody.innerHTML = rows.join("");
}

function renderAssessment() {
  const a = state.assessment || state.assessments?.[0] || {};
  ui.assessmentBox.textContent = JSON.stringify(a, null, 2);
}

function renderEvents() {
  const events = (state.recentEvents || []).slice(-80).reverse();
  ui.eventsList.innerHTML = events
    .map((e) => `<li><span class="tag">${esc(fmtTs(e.ts))}</span> ${esc(e.label)}</li>`)
    .join("");
}

function renderAlerts() {
  const alerts = (state.securityAlerts || []).slice(-80).reverse();
  ui.alertsList.innerHTML = alerts
    .map((a) => {
      const level =
        a.severity === "CRITICAL" ? "bad" : a.severity === "WARN" ? "warn" : "ok";
      const details = a.context ? `\n${esc(JSON.stringify(a.context))}` : "";
      return `<li><span class="tag ${level}">${esc(a.severity || "INFO")}</span><span class="tag">${esc(a.code || "-")}</span>${esc(a.message || "")}${details}</li>`;
    })
    .join("");
}

function renderSystem() {
  const sys = state.latestSystemStatus;
  if (!sys) {
    ui.systemSummary.textContent = "No system snapshot yet.";
    return;
  }
  ui.systemSummary.textContent =
    `mem=${fmtNum(sys.memoryRssMb, 2)} MB | ` +
    `eventRate=${fmtNum(sys.eventRatePerSec, 2)}/s | ` +
    `unauth=${sys.unauthorizedPerMin}/min | blockedIps=${sys.blockedIps}`;
}

function renderChart() {
  const canvas = ui.equityChart;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const points = state.vitalsHistory.slice(-120);
  if (points.length < 2) return;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    min = Math.min(min, p.equity);
    max = Math.max(max, p.equity);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }

  ctx.strokeStyle = "rgba(88, 211, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const x = (i / (points.length - 1)) * (w - 16) + 8;
    const y = h - 8 - ((points[i].equity - min) / (max - min)) * (h - 16);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function render() {
  renderKpis();
  renderServices();
  renderCandidates();
  renderAssessment();
  renderEvents();
  renderAlerts();
  renderSystem();
  renderChart();
}

ui.connectBtn.onclick = () => connectWs();

ui.startBtn.onclick = async () => {
  try {
    await post("/api/start");
    await fetchState();
  } catch (e) {
    setWsStatus("START FAILED", "bad");
    console.error(e);
  }
};

ui.stopBtn.onclick = async () => {
  try {
    await post("/api/stop");
    await fetchState();
  } catch (e) {
    setWsStatus("STOP FAILED", "bad");
    console.error(e);
  }
};

ui.refreshBtn.onclick = async () => {
  try {
    await fetchState();
  } catch (e) {
    console.error(e);
  }
};

ui.token.addEventListener("change", () => {
  localStorage.setItem("relay101.token", ui.token.value.trim());
});

async function boot() {
  try {
    await fetchState();
  } catch {
    // will recover once token is set
  }
  connectWs();
  statePollTimer = setInterval(() => {
    fetchState().catch(() => {});
  }, 8000);
}

boot();
