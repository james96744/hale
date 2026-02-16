export class TokenBucket {
    capacity;
    refillPerSec;
    tokens;
    lastRefill;
    constructor(capacity, refillPerSec) {
        this.capacity = capacity;
        this.refillPerSec = refillPerSec;
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }
    take(n = 1) {
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
