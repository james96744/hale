import { BaseService } from "../core/lifecycle.js";
import { TokenBucket } from "../infra/rateLimit.js";
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/**
 * TxEnricherJob
 * - Listens for pump.fun DEBUG_EVENT buy/sell signatures
 * - Fetches parsed transaction (rate-limited)
 * - Emits PUMPFUN_TRADE_TICK with best-effort mint, buyer, solAmount
 *
 * This gives CoinAssessmentJob real trade ticks to score.
 */
export class TxEnricherJob extends BaseService {
    conn;
    bus;
    cfg;
    name = "txEnricherJob";
    loopTask = null;
    q = [];
    offAny = null;
    bucket;
    constructor(conn, bus, cfg) {
        super();
        this.conn = conn;
        this.bus = bus;
        this.cfg = cfg;
        const qps = Math.max(1, cfg.maxQps);
        this.bucket = new TokenBucket(qps, qps);
    }
    async onStart(signal) {
        if (!this.cfg.enabled) {
            this.runningFlag = false;
            return;
        }
        this.offAny = this.bus.onAny((evt) => {
            if (evt.type !== "DEBUG_EVENT")
                return;
            const d = evt.data;
            const kind = d?.kind;
            if (kind !== "PUMPFUN_BUY" && kind !== "PUMPFUN_SELL")
                return;
            const task = { signature: String(d.signature ?? evt.key), kind, ts: evt.ts };
            if (this.q.length < this.cfg.maxQueue)
                this.q.push(task);
        });
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
        if (this.offAny)
            this.offAny();
        this.offAny = null;
        this.q = [];
    }
    async runLoop(signal) {
        try {
            while (!signal.aborted) {
                this.heartbeat();
                await this.drainOnce();
                await sleep(50);
            }
        }
        catch (e) {
            if (!String(e).includes("aborted")) {
                this.fail(e);
                this.runningFlag = false;
            }
        }
    }
    async drainOnce() {
        if (!this.bucket.take(1))
            return;
        const t = this.q.shift();
        if (!t)
            return;
        const tx = await this.conn.getParsedTransaction(t.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
        });
        if (!tx)
            return;
        // Best-effort:
        // - buyer = fee payer (first account key)
        // - mint = first postTokenBalance mint (if any)
        // - SOL amount = fee payer lamport delta (minus fee for buys)
        const keys = tx.transaction.message.accountKeys;
        const buyer = keys?.[0]?.pubkey?.toBase58?.() ?? keys?.[0]?.toBase58?.() ?? undefined;
        const postTokenBalances = tx.meta?.postTokenBalances;
        const mint = postTokenBalances?.[0]?.mint;
        const pre = tx.meta?.preBalances;
        const post = tx.meta?.postBalances;
        const fee = tx.meta?.fee;
        let solAmount = 0;
        if (pre && post && pre.length && post.length) {
            const delta = (pre[0] ?? 0) - (post[0] ?? 0); // positive means spent SOL
            if (t.kind === "PUMPFUN_BUY") {
                const spend = Math.max(0, delta - (fee ?? 0));
                solAmount = spend / 1e9;
            }
            else {
                // sell: buyer receives SOL -> delta negative
                solAmount = Math.max(0, (-delta) / 1e9);
            }
        }
        if (!mint || !buyer)
            return;
        const tick = {
            mint,
            side: t.kind === "PUMPFUN_BUY" ? "BUY" : "SELL",
            solAmount,
            buyer,
            curveProgress: undefined,
            txSig: t.signature,
        };
        this.bus.publish("pumpfun", "PUMPFUN_TRADE_TICK", mint, tick);
    }
}
