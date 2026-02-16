import "dotenv/config";
function parseBool(v, fallback) {
    if (v == null)
        return fallback;
    const x = v.trim().toLowerCase();
    if (x === "true" || x === "1" || x === "yes" || x === "on")
        return true;
    if (x === "false" || x === "0" || x === "no" || x === "off")
        return false;
    return fallback;
}
function parseNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
export const config = {
    port: parseNum(process.env.PORT, 8787),
    bindHost: process.env.BIND_HOST ?? "127.0.0.1",
    authToken: process.env.AUTH_TOKEN ?? "change_me",
    solanaHttp: process.env.SOLANA_RPC_HTTP ?? "http://127.0.0.1:8899",
    solanaWs: process.env.SOLANA_RPC_WS ?? "ws://127.0.0.1:8900",
    jitoEnabled: parseBool(process.env.JITO_ENABLED, false),
    pumpfunEnabled: parseBool(process.env.PUMPFUN_ENABLED, true),
    raydiumEnabled: parseBool(process.env.RAYDIUM_ENABLED, true),
    enricherEnabled: parseBool(process.env.ENRICHER_ENABLED, true),
    enricherMaxQps: parseNum(process.env.ENRICHER_MAX_QPS, 8),
    enricherMaxQueue: parseNum(process.env.ENRICHER_MAX_QUEUE, 500),
    assessmentEnabled: parseBool(process.env.ASSESSMENT_ENABLED, true),
    assessmentTickMs: parseNum(process.env.ASSESSMENT_TICK_MS, 1500),
    assessmentAlertRisk: parseNum(process.env.ASSESSMENT_ALERT_RISK, 70),
    authMaxFailuresPerMinute: parseNum(process.env.AUTH_MAX_FAILURES_PER_MIN, 40),
    authBlockSeconds: parseNum(process.env.AUTH_BLOCK_SECONDS, 300),
    authMaxConsecutiveFailures: parseNum(process.env.AUTH_MAX_CONSECUTIVE_FAILURES, 8),
    securityEnabled: parseBool(process.env.SECURITY_ENABLED, true),
    securityTickMs: parseNum(process.env.SECURITY_TICK_MS, 3000),
    securityStaleHeartbeatMs: parseNum(process.env.SECURITY_STALE_HEARTBEAT_MS, 15000),
    securityMaxMemoryMb: parseNum(process.env.SECURITY_MAX_MEMORY_MB, 1200),
    securityMaxUnauthorizedPerMin: parseNum(process.env.SECURITY_MAX_UNAUTHORIZED_PER_MIN, 60),
    securityAutoPauseOnCritical: parseBool(process.env.SECURITY_AUTO_PAUSE_ON_CRITICAL, true),
};
