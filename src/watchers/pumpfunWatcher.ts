import type { Connection } from "@solana/web3.js";
import type { EventBus } from "../pipeline/eventBus.js";
import type { PumpfunNewToken, PumpfunScoreUpdate, PumpfunTradeTick } from "../types/events.js";
import { BaseService } from "../core/lifecycle.js";

export type PumpfunWatcherConfig = {
  enabled: boolean;
  // TODO: set actual pump.fun program id when you implement log parsing
  pumpfunProgramId?: string;
  scoreIntervalMs: number; // e.g. 1000-5000
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

export class PumpfunWatcher extends BaseService {
  public readonly name = "pumpfunWatcher";
  private loopTask: Promise<void> | null = null;

  // In-memory stats for scoring (no DB)
  private perMint = new Map<string, {
    mint: string;
    symbol?: string;
    name?: string;
    tsLaunch: number;
    trades: number;
    uniqueBuyers: Set<string>;
    solInflow: number;
  }>();

  constructor(
    private conn: Connection,
    private bus: EventBus,
    private cfg: PumpfunWatcherConfig
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
    // TODO: remove Solana subscriptions here (when implemented)
  }

  private async runLoop(signal: AbortSignal) {
    // TODO (real): subscribe to pump.fun program logs
    // - conn.onLogs(programId, handler, "processed")
    // - parse logs, call emitNewToken / emitTradeTick
    //
    // For now: demo loop so UI wiring works.
    try {
      while (!signal.aborted) {
        this.heartbeat();
        this.emitDemoOnce();
        this.emitScoreUpdateDemo();
        await sleep(this.cfg.scoreIntervalMs, signal);
      }
    } catch (e) {
      if (!String(e).includes("aborted")) {
        this.fail(e);
        // Mark as not running so supervisor can restart
        this.runningFlag = false;
      }
    }
  }

  private emitNewToken(data: PumpfunNewToken) {
    this.perMint.set(data.mint, {
      mint: data.mint,
      symbol: data.symbol,
      name: data.name,
      tsLaunch: Date.now(),
      trades: 0,
      uniqueBuyers: new Set(),
      solInflow: 0,
    });
    this.bus.publish("pumpfun", "PUMPFUN_NEW_TOKEN", data.mint, data);
  }

  private emitTradeTick(tick: PumpfunTradeTick) {
    const st = this.perMint.get(tick.mint);
    if (st) {
      st.trades += 1;
      if (tick.buyer) st.uniqueBuyers.add(tick.buyer);
      if (tick.side === "BUY") st.solInflow += tick.solAmount;
    }
    this.bus.publish("pumpfun", "PUMPFUN_TRADE_TICK", tick.mint, tick);
  }

  private emitScoreUpdate(upd: PumpfunScoreUpdate) {
    this.bus.publishDedup("pumpfun", "PUMPFUN_SCORE_UPDATE", upd.mint, upd, 250);
  }

  // ---- DEMO ONLY ----
  private demoInitOnce = false;
  private emitDemoOnce() {
    if (this.demoInitOnce) return;
    this.demoInitOnce = true;
    this.emitNewToken({
      mint: "DemoMint111111111111111111111111111111111",
      symbol: "DEMO",
      name: "Demo Coin",
      creator: "DemoCreator",
      metadataUri: "ipfs://demo",
    });
  }

  private emitScoreUpdateDemo() {
    const mint = "DemoMint111111111111111111111111111111111";
    const buyer = `Buyer${Math.floor(Math.random() * 50)}`;

    this.emitTradeTick({
      mint,
      side: "BUY",
      solAmount: Math.random() * 0.2,
      buyer,
      curveProgress: Math.min(1, 0.1 + Math.random() * 0.9),
      txSig: `DemoSig${Math.floor(Math.random() * 1e9)}`,
    });

    const st = this.perMint.get(mint)!;
    const velocity = 10 + Math.random() * 40;
    const accel = (Math.random() - 0.5) * 8;
    const inflow = st.solInflow / Math.max(1, (Date.now() - st.tsLaunch) / 60000);

    const score = Math.max(0, Math.min(100,
      0.9 * velocity + 1.2 * accel + 0.3 * inflow + 0.1 * st.uniqueBuyers.size
    ));

    this.emitScoreUpdate({
      mint,
      symbol: st.symbol,
      name: st.name,
      score,
      curveProgress: 0.5 + Math.random() * 0.5,
      velocity,
      accel,
      solInflowPerMin: inflow,
      uniqueBuyers: st.uniqueBuyers.size,
      ts: Date.now(),
    });
  }
}
