import type { Connection } from "@solana/web3.js";
import { BaseService } from "../core/lifecycle.js";
import type { EventBus } from "../pipeline/eventBus.js";
import { TokenBucket } from "../infra/rateLimit.js";
import type { PumpfunTradeTick } from "../types/events.js";

export type TxEnricherJobConfig = {
  enabled: boolean;
  maxQps: number;
  maxQueue: number;
};

type EnrichTask = {
  signature: string;
  kind: "PUMPFUN_BUY" | "PUMPFUN_SELL";
  ts: number;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
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
  public readonly name = "txEnricherJob";
  private loopTask: Promise<void> | null = null;

  private q: EnrichTask[] = [];
  private offAny: (() => void) | null = null;
  private bucket: TokenBucket;

  constructor(
    private conn: Connection,
    private bus: EventBus,
    private cfg: TxEnricherJobConfig
  ) {
    super();
    const qps = Math.max(1, cfg.maxQps);
    this.bucket = new TokenBucket(qps, qps);
  }

  protected async onStart(signal: AbortSignal): Promise<void> {
    if (!this.cfg.enabled) { this.runningFlag = false; return; }

    this.offAny = this.bus.onAny((evt) => {
      if (evt.type !== "DEBUG_EVENT") return;
      const d = evt.data as any;
      const kind = d?.kind as string | undefined;
      if (kind !== "PUMPFUN_BUY" && kind !== "PUMPFUN_SELL") return;

      const task: EnrichTask = { signature: String(d.signature ?? evt.key), kind, ts: evt.ts };
      if (this.q.length < this.cfg.maxQueue) this.q.push(task);
    });

    this.loopTask = this.runLoop(signal);
  }

  protected async onStop(): Promise<void> {
    try {
      await this.loopTask;
    } catch {
      // loop failures are captured in fail()
    } finally {
      this.loopTask = null;
    }
    if (this.offAny) this.offAny();
    this.offAny = null;
    this.q = [];
  }

  private async runLoop(signal: AbortSignal) {
    try {
      while (!signal.aborted) {
        this.heartbeat();
        await this.drainOnce();
        await sleep(50);
      }
    } catch (e) {
      if (!String(e).includes("aborted")) {
        this.fail(e);
        this.runningFlag = false;
      }
    }
  }

  private async drainOnce() {
    if (!this.bucket.take(1)) return;
    const t = this.q.shift();
    if (!t) return;

    const tx = await this.conn.getParsedTransaction(t.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) return;

    // Best-effort:
    // - buyer = fee payer (first account key)
    // - mint = first postTokenBalance mint (if any)
    // - SOL amount = fee payer lamport delta (minus fee for buys)
    const keys = tx.transaction.message.accountKeys;
    const buyer = (keys?.[0] as any)?.pubkey?.toBase58?.() ?? (keys?.[0] as any)?.toBase58?.() ?? undefined;

    const postTokenBalances = (tx.meta as any)?.postTokenBalances as any[] | undefined;
    const mint = postTokenBalances?.[0]?.mint as string | undefined;

    const pre = (tx.meta as any)?.preBalances as number[] | undefined;
    const post = (tx.meta as any)?.postBalances as number[] | undefined;
    const fee = (tx.meta as any)?.fee as number | undefined;

    let solAmount = 0;
    if (pre && post && pre.length && post.length) {
      const delta = (pre[0] ?? 0) - (post[0] ?? 0); // positive means spent SOL
      if (t.kind === "PUMPFUN_BUY") {
        const spend = Math.max(0, delta - (fee ?? 0));
        solAmount = spend / 1e9;
      } else {
        // sell: buyer receives SOL -> delta negative
        solAmount = Math.max(0, (-delta) / 1e9);
      }
    }

    if (!mint || !buyer) return;

    const tick: PumpfunTradeTick = {
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
