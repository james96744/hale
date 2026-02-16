import { BaseService } from "../core/lifecycle.js";
import { FeatureStore } from "../features/featureStore.js";
import { buildAssessment } from "../intel/scoring/manipulationScore.js";
export class CoinAssessmentJob extends BaseService {
    bus;
    state;
    cfg;
    name = "coinAssessmentJob";
    timer = null;
    fs = new FeatureStore();
    offTrade = null;
    constructor(bus, state, cfg) {
        super();
        this.bus = bus;
        this.state = state;
        this.cfg = cfg;
    }
    async onStart(signal) {
        if (!this.cfg.enabled) {
            this.runningFlag = false;
            return;
        }
        // Listen to trade ticks that *do* contain mint + solAmount
        this.offTrade = this.bus.on("PUMPFUN_TRADE_TICK", (evt) => {
            const t = evt.ts;
            const tick = evt.data;
            const sol = Number.isFinite(tick.solAmount) ? tick.solAmount : 0;
            this.fs.recordTrade(tick.mint, t, sol, tick.buyer);
        });
        // Also: you can add listeners for Raydium swap ticks when you have per-mint mapping.
        this.timer = setInterval(() => {
            this.heartbeat();
            this.runOnce();
        }, this.cfg.tickMs);
        signal.addEventListener("abort", () => this.heartbeat(), { once: true });
    }
    async onStop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
        if (this.offTrade)
            this.offTrade();
        this.offTrade = null;
    }
    runOnce() {
        const now = Date.now();
        // candidate set: mints we have seen in state.candidates OR feature store
        const mints = new Set([
            ...Array.from(this.state.candidates.keys()),
            ...this.fs.mints(),
        ]);
        for (const mint of mints) {
            const snap = this.fs.snapshot(mint, now);
            if (!snap)
                continue;
            const c = this.state.candidates.get(mint);
            const assessment = buildAssessment(mint, c?.symbol, c?.name, snap);
            // Publish assessment update event (consumed by telemetry)
            this.bus.publish("telemetry", "COIN_ASSESSMENT_UPDATED", mint, assessment);
            // If manipulation risk is high with decent confidence, publish an alert
            if (assessment.manipulationRisk >= this.cfg.alertRiskThreshold && assessment.confidence >= 0.35) {
                this.bus.publish("risk", "MANIPULATION_ALERT", mint, {
                    mint,
                    ts: now,
                    risk: assessment.manipulationRisk,
                    reasons: assessment.topReasons.map(r => String(r.code)),
                });
            }
        }
    }
}
