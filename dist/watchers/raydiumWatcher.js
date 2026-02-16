import { BaseService } from "../core/lifecycle.js";
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(), ms);
        const onAbort = () => {
            clearTimeout(t);
            reject(new Error("aborted"));
        };
        if (signal.aborted)
            return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
    });
}
export class RaydiumWatcher extends BaseService {
    conn;
    bus;
    cfg;
    isTrackedMint;
    name = "raydiumWatcher";
    loopTask = null;
    pools = new Map();
    constructor(conn, bus, cfg, isTrackedMint) {
        super();
        this.conn = conn;
        this.bus = bus;
        this.cfg = cfg;
        this.isTrackedMint = isTrackedMint;
    }
    async onStart(signal) {
        if (!this.cfg.enabled) {
            this.runningFlag = false;
            return;
        }
        this.loopTask = this.runLoop(signal);
    }
    async onStop() {
        try {
            await this.loopTask;
        }
        catch {
            // loop failures are captured in fail()
        }
        finally {
            this.loopTask = null;
        }
        // TODO: remove subscriptions when implemented
    }
    async runLoop(signal) {
        // TODO (real): subscribe to Raydium program logs + account changes
        // - detect pool creation, swaps
        // - subscribe to vault balances for liquidity deltas
        //
        // For now: demo loop.
        try {
            while (!signal.aborted) {
                this.heartbeat();
                this.demoRaydiumEventsOnce();
                this.demoRaydiumTick();
                await sleep(this.cfg.pollBackstopMs, signal);
            }
        }
        catch (e) {
            if (!String(e).includes("aborted")) {
                this.fail(e);
                this.runningFlag = false;
            }
        }
    }
    emitPoolCreated(evt) {
        this.pools.set(evt.poolId, evt);
        this.bus.publish("raydium", "RAYDIUM_POOL_CREATED", evt.poolId, evt);
        if (this.isTrackedMint(evt.baseMint)) {
            const mig = {
                mint: evt.baseMint,
                poolId: evt.poolId,
                liquiditySOL: undefined,
                timeFromLaunchSec: undefined,
                ts: Date.now(),
            };
            this.bus.publish("raydium", "MIGRATION_DETECTED", evt.baseMint, mig);
        }
    }
    emitLiquidityChanged(evt) {
        this.bus.publishDedup("raydium", "RAYDIUM_LIQUIDITY_CHANGED", evt.poolId, evt, 250);
    }
    emitSwapTick(evt) {
        this.bus.publishDedup("raydium", "RAYDIUM_SWAP_TICK", evt.poolId, evt, 150);
    }
    // ---- DEMO ONLY ----
    demoInitOnce = false;
    demoRaydiumEventsOnce() {
        if (this.demoInitOnce)
            return;
        this.demoInitOnce = true;
        this.emitPoolCreated({
            poolId: "DemoPool111111111111111111111111111111111",
            baseMint: "DemoMint111111111111111111111111111111111",
            quoteMint: "So11111111111111111111111111111111111111112",
            lpMint: "DemoLP11111111111111111111111111111111111",
            creator: "DemoCreator",
            ts: Date.now(),
        });
    }
    demoRaydiumTick() {
        const poolId = "DemoPool111111111111111111111111111111111";
        const baseMint = "DemoMint111111111111111111111111111111111";
        const quoteMint = "So11111111111111111111111111111111111111112";
        const pct = (Math.random() - 0.45) * 0.08;
        this.emitLiquidityChanged({
            poolId,
            baseMint,
            quoteMint,
            baseLiquidity: 1000 + Math.random() * 200,
            quoteLiquidity: 200 + Math.random() * 50,
            pctChange: pct,
            ts: Date.now(),
        });
        this.emitSwapTick({
            poolId,
            baseMint,
            quoteMint,
            price: 0.0002 + Math.random() * 0.00005,
            volumeQuote: Math.random() * 20,
            txSig: `DemoSwap${Math.floor(Math.random() * 1e9)}`,
            ts: Date.now(),
        });
    }
}
