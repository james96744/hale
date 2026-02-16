type FetchResult = {
  url: string;
  ts: number;
  ok: boolean;
  status?: number;
  text?: string;
  error?: string;
};

export type WebIngestConfig = {
  maxPerHostPerMin: number;
  maxTextChars: number;
};

function nowMs() { return Date.now(); }

function hashText(s: string): string {
  // Fast dedupe hash (not cryptographic requirements here)
  let h = 2166136261;
  for (let i=0;i<s.length;i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private refillPerMs: number) {
    this.tokens = capacity;
    this.lastRefill = nowMs();
  }
  take(n = 1): boolean {
    const now = nowMs();
    const dt = Math.max(0, now - this.lastRefill);
    const refill = dt * this.refillPerMs;
    this.tokens = Math.min(this.capacity, this.tokens + refill);
    this.lastRefill = now;
    if (this.tokens >= n) { this.tokens -= n; return true; }
    return false;
  }
}

/**
 * WebIngestor is a stub: it fetches pages with per-host rate limiting and text dedupe.
 * You can wrap this with site-specific parsers (Reddit, forums, etc.).
 */
export class WebIngestor {
  private buckets = new Map<string, TokenBucket>();
  private seen = new Map<string, number>(); // hash -> ts
  private seenMax = 5000;

  constructor(private cfg: WebIngestConfig) {}

  async fetchText(url: string): Promise<FetchResult> {
    const u = new URL(url);
    const host = u.host;

    const bucket = this.getBucket(host);
    if (!bucket.take(1)) {
      return { url, ts: nowMs(), ok: false, error: "rate_limited" };
    }

    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "relay101/0.1 (+local research agent)",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      const status = res.status;
      const ok = res.ok;

      const raw = await res.text();
      const text = raw.slice(0, this.cfg.maxTextChars);

      const h = hashText(text);
      const last = this.seen.get(h);
      if (last && nowMs() - last < 10 * 60_000) {
        return { url, ts: nowMs(), ok: false, status, error: "duplicate_content" };
      }
      this.seen.set(h, nowMs());
      if (this.seen.size > this.seenMax) {
        const keys = Array.from(this.seen.keys()).slice(0, this.seen.size - this.seenMax);
        for (const k of keys) this.seen.delete(k);
      }

      return { url, ts: nowMs(), ok, status, text };
    } catch (e) {
      return { url, ts: nowMs(), ok: false, error: String(e) };
    }
  }

  private getBucket(host: string) {
    let b = this.buckets.get(host);
    if (b) return b;

    // capacity = maxPerHostPerMin, refill rate = capacity per minute
    const cap = Math.max(1, this.cfg.maxPerHostPerMin);
    b = new TokenBucket(cap, cap / 60_000);
    this.buckets.set(host, b);
    return b;
  }
}
