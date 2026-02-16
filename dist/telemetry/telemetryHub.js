import { BaseService } from "../core/lifecycle.js";
export class TelemetryHub extends BaseService {
    bus;
    state;
    name = "telemetryHub";
    subs = new Set();
    tickTimer = null;
    offAny = null;
    constructor(bus, state) {
        super();
        this.bus = bus;
        this.state = state;
    }
    subscribe(fn) {
        this.subs.add(fn);
        fn({ type: "analytics", data: this.state.analytics });
        fn({ type: "vitals", data: this.state.latestVitals });
        fn({ type: "candidates", data: this.topCandidates(25) });
        if (this.state.latestSystemStatus) {
            fn({ type: "system_status", data: this.state.latestSystemStatus });
        }
        fn({ type: "events", data: this.state.recentEvents.slice(-50) });
        const latestAssessment = this.latestAssessment();
        if (latestAssessment)
            fn({ type: "assessment", data: latestAssessment });
        const latestSecurity = this.state.securityAlerts[this.state.securityAlerts.length - 1];
        if (latestSecurity)
            fn({ type: "security_alert", data: latestSecurity });
        return () => this.subs.delete(fn);
    }
    async onStart(_signal) {
        // Listen to events and update state + broadcast
        this.offAny = this.bus.onAny((evt) => this.onEvent(evt));
        // periodic snapshots (1/sec)
        this.tickTimer = setInterval(() => {
            this.heartbeat();
            this.emitSnapshots();
        }, 1000);
    }
    async onStop() {
        if (this.tickTimer)
            clearInterval(this.tickTimer);
        this.tickTimer = null;
        if (this.offAny)
            this.offAny();
        this.offAny = null;
        // Keep subscribers; WS layer will remove on socket close. No disk.
    }
    broadcast(msg) {
        for (const fn of this.subs) {
            try {
                fn(msg);
            }
            catch { /* ignore */ }
        }
    }
    onEvent(evt) {
        if (evt.type === "PUMPFUN_NEW_TOKEN" ||
            evt.type === "RAYDIUM_POOL_CREATED" ||
            evt.type === "MIGRATION_DETECTED" ||
            evt.type === "RUG_ALERT" ||
            evt.type === "MANIPULATION_ALERT" ||
            evt.type === "SECURITY_ALERT") {
            this.state.recentEvents.push({ ts: evt.ts, label: `${evt.type} • ${evt.key}`, key: evt.key });
            if (this.state.recentEvents.length > 300)
                this.state.recentEvents.shift();
            this.broadcast({ type: "events", data: this.state.recentEvents.slice(-50) });
        }
        if (evt.type === "PUMPFUN_SCORE_UPDATE") {
            const c = evt.data;
            this.state.candidates.set(c.mint, c);
            this.broadcast({ type: "candidates", data: this.topCandidates(25) });
        }
        if (evt.type === "RUG_ASSESSMENT") {
            const r = evt.data;
            this.state.rugAssessments.set(r.mint, r);
            this.broadcast({ type: "rug_assessment", data: r });
        }
        if (evt.type === "RUG_ALERT") {
            const a = evt.data;
            this.state.rugAlerts.push(a);
            if (this.state.rugAlerts.length > 50)
                this.state.rugAlerts.shift();
            this.broadcast({ type: "rug_alert", data: a });
        }
        if (evt.type === "COIN_ASSESSMENT_UPDATED") {
            const a = evt.data;
            this.state.coinAssessments.set(a.mint, a);
            this.broadcast({ type: "assessment", data: a });
        }
        if (evt.type === "SYSTEM_STATUS") {
            const s = evt.data;
            this.state.latestSystemStatus = s;
            this.broadcast({ type: "system_status", data: s });
        }
        if (evt.type === "SECURITY_ALERT") {
            const a = evt.data;
            this.state.securityAlerts.push(a);
            if (this.state.securityAlerts.length > 200)
                this.state.securityAlerts.shift();
            this.broadcast({ type: "security_alert", data: a });
        }
    }
    emitSnapshots() {
        if (this.state.status === "RUNNING" && this.state.startedAt) {
            this.state.analytics.uptimeSec = Math.floor((Date.now() - this.state.startedAt) / 1000);
        }
        else {
            this.state.analytics.uptimeSec = 0;
        }
        this.state.latestVitals = this.computeVitalsStub(this.state.latestVitals);
        this.broadcast({ type: "analytics", data: this.state.analytics });
        this.broadcast({ type: "vitals", data: this.state.latestVitals });
    }
    latestAssessment() {
        let out;
        for (const a of this.state.coinAssessments.values()) {
            if (!out || a.ts > out.ts)
                out = a;
        }
        return out;
    }
    topCandidates(n) {
        return Array.from(this.state.candidates.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, n);
    }
    computeVitalsStub(prev) {
        const now = Date.now();
        const equity = this.state.analytics.equitySOL || 10;
        const drift = this.state.status === "RUNNING" ? (Math.random() - 0.45) * 0.02 : 0;
        const nextEquity = Math.max(0, equity + drift);
        this.state.analytics.equitySOL = nextEquity;
        this.state.analytics.totalPnL_SOL = nextEquity - (this.state.analytics.bankrollSOL || 10);
        this.state.analytics.dailyPnL_SOL += drift;
        const pnl = this.state.analytics.totalPnL_SOL;
        const dd = Math.min(0, pnl); // placeholder
        return {
            t: now,
            equity: nextEquity,
            pnl,
            drawdown: dd,
            winRate: this.state.analytics.winRate,
            trades: this.estimateTradeCount(prev.trades),
        };
    }
    estimateTradeCount(prevTrades) {
        let max = prevTrades;
        for (const a of this.state.coinAssessments.values()) {
            if (a.features.trades_5m > max)
                max = a.features.trades_5m;
        }
        return max;
    }
}
