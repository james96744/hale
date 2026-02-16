/**
 * Simple rolling window counter/summer/unique counter.
 * Keeps samples in memory and prunes by time.
 */
export class RollingWindow {
    windowMs;
    samples = [];
    uniqMap = new Map(); // key -> lastSeenTs
    constructor(windowMs) {
        this.windowMs = windowMs;
    }
    push(t, v, key) {
        this.samples.push({ t, v, key });
        if (key)
            this.uniqMap.set(key, t);
        this.prune(t);
    }
    prune(now) {
        const cutoff = now - this.windowMs;
        // prune samples
        while (this.samples.length && this.samples[0].t < cutoff) {
            const s = this.samples.shift();
            // uniqMap pruning handled separately
        }
        // prune uniq keys
        for (const [k, ts] of this.uniqMap) {
            if (ts < cutoff)
                this.uniqMap.delete(k);
        }
    }
    count(now) {
        this.prune(now);
        return this.samples.length;
    }
    sum(now) {
        this.prune(now);
        let s = 0;
        for (const x of this.samples)
            s += x.v;
        return s;
    }
    uniq(now) {
        this.prune(now);
        return this.uniqMap.size;
    }
    times(now) {
        this.prune(now);
        return this.samples.map((s) => s.t);
    }
}
