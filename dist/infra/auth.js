import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
function normalizeToken(t) {
    return String(t ?? "").trim();
}
function tokenEquals(a, b) {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length)
        return false;
    return timingSafeEqual(aBuf, bBuf);
}
function getClientIp(req) {
    return req.ip || req.socket.remoteAddress || "unknown";
}
export class AuthSecurityTracker {
    maxFailuresPerMinute;
    maxConsecutiveFailures;
    blockSeconds;
    byIp = new Map();
    unauthorizedTimes = [];
    ttlMs = 30 * 60_000;
    totalSuccesses = 0;
    totalFailures = 0;
    constructor(maxFailuresPerMinute, maxConsecutiveFailures, blockSeconds) {
        this.maxFailuresPerMinute = maxFailuresPerMinute;
        this.maxConsecutiveFailures = maxConsecutiveFailures;
        this.blockSeconds = blockSeconds;
    }
    isBlocked(ip, now = Date.now()) {
        const st = this.byIp.get(ip);
        if (!st)
            return false;
        return st.blockedUntilMs > now;
    }
    recordSuccess(ip, now = Date.now()) {
        this.totalSuccesses += 1;
        const st = this.byIp.get(ip);
        if (!st)
            return;
        st.consecutiveFailures = 0;
        if (st.windowStartMs < now - 60_000) {
            st.windowStartMs = now;
            st.failuresInWindow = 0;
        }
    }
    recordFailure(ip, now = Date.now()) {
        this.totalFailures += 1;
        this.unauthorizedTimes.push(now);
        const st = this.byIp.get(ip) ?? {
            windowStartMs: now,
            failuresInWindow: 0,
            consecutiveFailures: 0,
            blockedUntilMs: 0,
        };
        if (st.windowStartMs < now - 60_000) {
            st.windowStartMs = now;
            st.failuresInWindow = 0;
        }
        st.failuresInWindow += 1;
        st.consecutiveFailures += 1;
        if (st.failuresInWindow >= this.maxFailuresPerMinute ||
            st.consecutiveFailures >= this.maxConsecutiveFailures) {
            st.blockedUntilMs = now + this.blockSeconds * 1000;
            st.consecutiveFailures = 0;
            st.failuresInWindow = 0;
            st.windowStartMs = now;
        }
        this.byIp.set(ip, st);
        this.prune(now);
    }
    snapshot(now = Date.now()) {
        this.prune(now);
        let blockedIps = 0;
        for (const st of this.byIp.values()) {
            if (st.blockedUntilMs > now)
                blockedIps += 1;
        }
        return {
            totalSuccesses: this.totalSuccesses,
            totalFailures: this.totalFailures,
            unauthorizedPerMin: this.unauthorizedTimes.length,
            blockedIps,
        };
    }
    prune(now) {
        const cutoffUnauthorized = now - 60_000;
        while (this.unauthorizedTimes.length && this.unauthorizedTimes[0] < cutoffUnauthorized) {
            this.unauthorizedTimes.shift();
        }
        const cutoffIp = now - this.ttlMs;
        for (const [ip, st] of this.byIp) {
            if (st.blockedUntilMs > now)
                continue;
            if (st.windowStartMs < cutoffIp)
                this.byIp.delete(ip);
        }
    }
}
export function createAuthGuard(opts = {}) {
    const token = normalizeToken(opts.token ?? config.authToken);
    const tracker = new AuthSecurityTracker(Math.max(1, opts.maxFailuresPerMinute ?? config.authMaxFailuresPerMinute), Math.max(1, opts.maxConsecutiveFailures ?? config.authMaxConsecutiveFailures), Math.max(10, opts.blockSeconds ?? config.authBlockSeconds));
    const requireAuth = (req, res, next) => {
        const ip = getClientIp(req);
        const now = Date.now();
        const header = req.headers.authorization;
        const received = normalizeToken(header?.startsWith("Bearer ") ? header.slice(7) : undefined);
        if (received && tokenEquals(received, token)) {
            tracker.recordSuccess(ip, now);
            next();
            return;
        }
        if (tracker.isBlocked(ip, now)) {
            return res.status(429).json({ error: "too_many_attempts" });
        }
        if (!received || !tokenEquals(received, token)) {
            tracker.recordFailure(ip, now);
            if (tracker.isBlocked(ip, now)) {
                return res.status(429).json({ error: "too_many_attempts" });
            }
            return res.status(401).json({ error: "unauthorized" });
        }
    };
    return {
        requireAuth,
        tracker,
    };
}
