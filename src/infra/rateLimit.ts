export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private capacity: number, private refillPerSec: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  take(n = 1): boolean {
    const now = Date.now();
    const dt = Math.max(0, now - this.lastRefill) / 1000;
    const refill = dt * this.refillPerSec;
    this.tokens = Math.min(this.capacity, this.tokens + refill);
    this.lastRefill = now;

    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }
}
