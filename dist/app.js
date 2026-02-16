import http from "node:http";
import path from "node:path";
import express from "express";
import { config } from "./config.js";
import { makeSolanaConnection } from "./infra/solana.js";
import { RingLogger } from "./infra/logger.js";
import { createAuthGuard } from "./infra/auth.js";
import { EventBus } from "./pipeline/eventBus.js";
import { makeInitialState } from "./core/state.js";
import { TelemetryHub } from "./telemetry/telemetryHub.js";
import { attachWsTelemetry } from "./telemetry/wsServer.js";
import { PumpfunWatcher } from "./watchers/pumpfunWatcher.js";
import { RaydiumWatcher } from "./watchers/raydiumWatcher.js";
import { Supervisor } from "./core/supervisor.js";
import { TxEnricherJob } from "./jobs/txEnricherJob.js";
import { CoinAssessmentJob } from "./jobs/coinAssessmentJob.js";
import { SecuritySentinel } from "./security/securitySentinel.js";
const log = new RingLogger(5000);
const app = express();
app.use(express.json({ limit: "256kb" }));
const server = http.createServer(app);
const conn = makeSolanaConnection();
const bus = new EventBus();
const state = makeInitialState(config.solanaHttp, config.jitoEnabled);
const auth = createAuthGuard();
const telemetry = new TelemetryHub(bus, state);
const pumpfun = new PumpfunWatcher(conn, bus, {
    enabled: config.pumpfunEnabled,
    scoreIntervalMs: 1000,
    // pumpfunProgramId: process.env.PUMPFUN_PROGRAM_ID
});
const raydium = new RaydiumWatcher(conn, bus, {
    enabled: config.raydiumEnabled,
    pollBackstopMs: 1500,
    // raydiumProgramId: process.env.RAYDIUM_AMM_V4_PROGRAM_ID
}, (mint) => state.candidates.has(mint));
const txEnricher = new TxEnricherJob(conn, bus, {
    enabled: config.enricherEnabled,
    maxQps: config.enricherMaxQps,
    maxQueue: config.enricherMaxQueue,
});
const coinAssessment = new CoinAssessmentJob(bus, state, {
    enabled: config.assessmentEnabled,
    tickMs: config.assessmentTickMs,
    alertRiskThreshold: config.assessmentAlertRisk,
});
let supervisor;
let emergencyPauseInFlight = false;
async function emergencyPause(alert) {
    if (emergencyPauseInFlight)
        return;
    if (state.status !== "RUNNING")
        return;
    emergencyPauseInFlight = true;
    try {
        log.log(`[security] CRITICAL ${alert.code}: ${alert.message}`);
        state.status = "ERROR";
        state.startedAt = undefined;
        state.analytics.status = "ERROR";
        state.analytics.lastAction = `auto_pause:${alert.code}`;
        await supervisor.stopAll();
    }
    finally {
        emergencyPauseInFlight = false;
    }
}
const security = new SecuritySentinel(bus, {
    enabled: config.securityEnabled,
    tickMs: config.securityTickMs,
    staleHeartbeatMs: config.securityStaleHeartbeatMs,
    maxMemoryMb: config.securityMaxMemoryMb,
    maxUnauthorizedPerMin: config.securityMaxUnauthorizedPerMin,
    autoPauseOnCritical: config.securityAutoPauseOnCritical,
    repeatAlertSuppressionMs: 30_000,
}, {
    authSnapshot: () => auth.tracker.snapshot(),
    servicesSnapshot: () => supervisor.status().services,
    isRuntimeRunning: () => state.status === "RUNNING",
    onCritical: emergencyPause,
});
supervisor = new Supervisor([telemetry, pumpfun, raydium, txEnricher, coinAssessment, security], (line) => log.log(line));
attachWsTelemetry(server, telemetry);
const uiDir = path.resolve(process.cwd(), "ui");
app.use("/ui", express.static(uiDir));
app.get("/", (_req, res) => res.sendFile(path.resolve(uiDir, "index.html")));
app.get("/api/health", (_req, res) => res.json({
    ok: true,
    status: state.status,
    uptimeSec: state.analytics.uptimeSec,
    auth: auth.tracker.snapshot(),
    supervisor: supervisor.status(),
}));
app.get("/api/state", auth.requireAuth, (_req, res) => {
    const topAssessments = Array.from(state.coinAssessments.values())
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 20);
    res.json({
        status: state.status,
        analytics: state.analytics,
        vitals: state.latestVitals,
        candidates: Array.from(state.candidates.values()).slice(0, 50),
        assessments: topAssessments,
        recentEvents: state.recentEvents.slice(-50),
        securityAlerts: state.securityAlerts.slice(-50),
        latestSystemStatus: state.latestSystemStatus,
        supervisor: supervisor.status(),
        auth: auth.tracker.snapshot(),
    });
});
app.get("/api/security", auth.requireAuth, (_req, res) => {
    res.json({
        auth: auth.tracker.snapshot(),
        latestSystemStatus: state.latestSystemStatus,
        securityAlerts: state.securityAlerts.slice(-100),
        serviceStatus: supervisor.status(),
    });
});
app.post("/api/start", auth.requireAuth, async (_req, res) => {
    if (state.status === "RUNNING")
        return res.json({ ok: true, status: state.status });
    state.status = "RUNNING";
    state.startedAt = Date.now();
    state.analytics.status = "RUNNING";
    state.analytics.lastAction = "start";
    if (!state.analytics.bankrollSOL)
        state.analytics.bankrollSOL = 10;
    if (!state.analytics.equitySOL)
        state.analytics.equitySOL = 10;
    await supervisor.startAll();
    log.log("Relay101 started");
    res.json({ ok: true, status: state.status });
});
app.post("/api/stop", auth.requireAuth, async (_req, res) => {
    if (state.status === "STOPPED")
        return res.json({ ok: true, status: state.status });
    state.status = "STOPPED";
    state.startedAt = undefined;
    state.analytics.status = "STOPPED";
    state.analytics.lastAction = "stop";
    await supervisor.stopAll();
    log.log("Relay101 stopped");
    res.json({ ok: true, status: state.status });
});
app.get("/api/debug/ringbuffer", auth.requireAuth, (_req, res) => {
    res.json({ lines: log.snapshot() });
});
if (config.authToken === "change_me") {
    log.log("[security] AUTH_TOKEN is default 'change_me'. Set a strong token before exposing this host.");
}
server.listen(config.port, config.bindHost, () => {
    log.log(`Relay101 API listening on http://${config.bindHost}:${config.port}`);
    log.log(`Dashboard: http://${config.bindHost}:${config.port}/`);
    log.log(`WS telemetry on ws://${config.bindHost}:${config.port}/ws/telemetry?token=***`);
});
