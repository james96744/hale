import type { Connection } from "@solana/web3.js";
import type { EventBus } from "../pipeline/eventBus.js";
import type { MigrationDetected, RaydiumLiquidityChanged, RaydiumPoolCreated, RaydiumSwapTick } from "../types/events.js";
import { BaseService } from "../core/lifecycle.js";

export type RaydiumWatcherConfig = {
  enabled: boolean;
  // TODO: set actual Raydium program IDs when implementing
  raydiumProgramId?: string;
  pollBackstopMs: number; // polling fallback interval
};

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => resolve(), ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class RaydiumWatcher extends BaseService {
  public readonly name = "raydiumWatcher";
  private loopTask: Promise<void> | null = null;

  private pools = new Map<string, RaydiumPoolCreated>();

  constructor(
    private conn: Connection,
    private bus: EventBus,
    private cfg: RaydiumWatcherConfig,
    private isTrackedMint: (mint: string) => boolean
  ) { super(); }

  protected async onStart(signal: AbortSignal): Promise<void> {
    if (!this.cfg.enabled) {
      this.runningFlag = false;
      return;
    }

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
    // TODO: remove subscriptions when implemented
  }

  private async runLoop(signal: AbortSignal) {
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
    } catch (e) {
      if (!String(e).includes("aborted")) {
        this.fail(e);
        this.runningFlag = false;
      }
    }
  }

  private emitPoolCreated(evt: RaydiumPoolCreated) {
    this.pools.set(evt.poolId, evt);
    this.bus.publish("raydium", "RAYDIUM_POOL_CREATED", evt.poolId, evt);

    if (this.isTrackedMint(evt.baseMint)) {
      const mig: MigrationDetected = {
        mint: evt.baseMint,
        poolId: evt.poolId,
        liquiditySOL: undefined,
        timeFromLaunchSec: undefined,
        ts: Date.now(),
      };
      this.bus.publish("raydium", "MIGRATION_DETECTED", evt.baseMint, mig);
    }
  }

  private emitLiquidityChanged(evt: RaydiumLiquidityChanged) {
    this.bus.publishDedup("raydium", "RAYDIUM_LIQUIDITY_CHANGED", evt.poolId, evt, 250);
  }

  private emitSwapTick(evt: RaydiumSwapTick) {
    this.bus.publishDedup("raydium", "RAYDIUM_SWAP_TICK", evt.poolId, evt, 150);
  }

  // ---- DEMO ONLY ----
  private demoInitOnce = false;

  private demoRaydiumEventsOnce() {
    if (this.demoInitOnce) return;
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

  private demoRaydiumTick() {
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
