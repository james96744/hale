type Sample = { t: number; v: number; key?: string };

/**
 * Simple rolling window counter/summer/unique counter.
 * Keeps samples in memory and prunes by time.
 */
export class RollingWindow {
  private samples: Sample[] = [];
  private uniqMap: Map<string, number> = new Map(); // key -> lastSeenTs

  constructor(private windowMs: number) {}

  push(t: number, v: number, key?: string) {
    this.samples.push({ t, v, key });
    if (key) this.uniqMap.set(key, t);
    this.prune(t);
  }

  prune(now: number) {
    const cutoff = now - this.windowMs;
    // prune samples
    while (this.samples.length && this.samples[0]!.t < cutoff) {
      const s = this.samples.shift()!;
      // uniqMap pruning handled separately
    }
    // prune uniq keys
    for (const [k, ts] of this.uniqMap) {
      if (ts < cutoff) this.uniqMap.delete(k);
    }
  }

  count(now: number) {
    this.prune(now);
    return this.samples.length;
  }

  sum(now: number) {
    this.prune(now);
    let s = 0;
    for (const x of this.samples) s += x.v;
    return s;
  }

  uniq(now: number) {
    this.prune(now);
    return this.uniqMap.size;
  }

  times(now: number): number[] {
    this.prune(now);
    return this.samples.map((s) => s.t);
  }
}
