/**
 * Minimal lifecycle helper:
 * - idempotent start/stop
 * - abortable loops via AbortController
 * - heartbeat tracking for supervision/telemetry
 */
export class BaseService {
    runningFlag = false;
    abort = null;
    lastStartAt;
    lastStopAt;
    lastHeartbeatAt;
    lastError;
    async start() {
        if (this.runningFlag)
            return;
        this.runningFlag = true;
        this.lastStartAt = Date.now();
        this.lastError = undefined;
        this.abort = new AbortController();
        await this.onStart(this.abort.signal);
    }
    async stop() {
        if (!this.runningFlag)
            return;
        this.runningFlag = false;
        this.lastStopAt = Date.now();
        try {
            this.abort?.abort();
        }
        catch { /* ignore */ }
        await this.onStop();
        this.abort = null;
    }
    status() {
        return {
            name: this.name,
            running: this.runningFlag,
            lastStartAt: this.lastStartAt,
            lastStopAt: this.lastStopAt,
            lastHeartbeatAt: this.lastHeartbeatAt,
            lastError: this.lastError,
        };
    }
    heartbeat() {
        this.lastHeartbeatAt = Date.now();
    }
    fail(err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        this.lastError = msg;
    }
}
