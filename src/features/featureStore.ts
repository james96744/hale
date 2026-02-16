import { RollingWindow } from "./rollingWindow.js";

export type MintFeatureWindows = {
  trades15s: RollingWindow;
  trades1m: RollingWindow;
  trades5m: RollingWindow;

  // store SOL volume per trade (if known)
  vol15s: RollingWindow;
  vol1m: RollingWindow;
  vol5m: RollingWindow;
};

export class FeatureStore {
  private byMint = new Map<string, MintFeatureWindows>();

  getOrCreate(mint: string): MintFeatureWindows {
    let w = this.byMint.get(mint);
    if (w) return w;

    w = {
      trades15s: new RollingWindow(15_000),
      trades1m: new RollingWindow(60_000),
      trades5m: new RollingWindow(300_000),

      vol15s: new RollingWindow(15_000),
      vol1m: new RollingWindow(60_000),
      vol5m: new RollingWindow(300_000),
    };
    this.byMint.set(mint, w);
    return w;
  }

  recordTrade(mint: string, t: number, solAmount: number, buyer?: string) {
    const w = this.getOrCreate(mint);
    w.trades15s.push(t, 1, buyer);
    w.trades1m.push(t, 1, buyer);
    w.trades5m.push(t, 1, buyer);

    w.vol15s.push(t, solAmount, buyer);
    w.vol1m.push(t, solAmount, buyer);
    w.vol5m.push(t, solAmount, buyer);
  }

  snapshot(mint: string, now: number) {
    const w = this.byMint.get(mint);
    if (!w) return null;

    const trades_15s = w.trades15s.count(now);
    const trades_1m = w.trades1m.count(now);
    const trades_5m = w.trades5m.count(now);

    const uniqBuyers_15s = w.trades15s.uniq(now);
    const uniqBuyers_1m = w.trades1m.uniq(now);
    const uniqBuyers_5m = w.trades5m.uniq(now);

    const solVolume_15s = w.vol15s.sum(now);
    const solVolume_1m = w.vol1m.sum(now);
    const solVolume_5m = w.vol5m.sum(now);

    const times1m = w.trades1m.times(now).sort((a,b)=>a-b);
    let cadenceMeanSec: number | undefined;
    let cadenceStdSec: number | undefined;

    if (times1m.length >= 3) {
      const intervals = [];
      for (let i=1;i<times1m.length;i++) intervals.push((times1m[i]-times1m[i-1])/1000);
      const mean = intervals.reduce((a,b)=>a+b,0)/intervals.length;
      const varr = intervals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/intervals.length;
      cadenceMeanSec = mean;
      cadenceStdSec = Math.sqrt(varr);
    }

    return {
      trades_15s, trades_1m, trades_5m,
      uniqBuyers_15s, uniqBuyers_1m, uniqBuyers_5m,
      solVolume_15s, solVolume_1m, solVolume_5m,
      cadenceMeanSec_1m: cadenceMeanSec,
      cadenceStdSec_1m: cadenceStdSec,
    };
  }

  mints(): string[] {
    return Array.from(this.byMint.keys());
  }
}
