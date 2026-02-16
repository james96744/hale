function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/**
 * Supervisor:
 * - starts/stops all services
 * - restarts crashed services with backoff
 * - provides status snapshot
 */
export class Supervisor {
    services;
    onLog;
    running = false;
    restartLoop = null;
    backoff = new Map(); // name -> ms
    constructor(services, onLog) {
        this.services = services;
        this.onLog = onLog;
    }
    async startAll() {
        if (this.running)
            return;
        this.running = true;
        for (const s of this.services) {
            await this.safeStart(s);
        }
        // lightweight watchdog: if a service is marked running but has a recent error, restart it
        this.restartLoop = setInterval(() => void this.watchdogTick(), 2000);
    }
    async stopAll() {
        if (!this.running)
            return;
        this.running = false;
        if (this.restartLoop)
            clearInterval(this.restartLoop);
        this.restartLoop = null;
        // Stop in reverse order (typically: telemetry last on start; first on stop)
        for (const s of [...this.services].reverse()) {
            await this.safeStop(s);
        }
    }
    status() {
        return { running: this.running, services: this.services.map((s) => s.status()) };
    }
    log(line) {
        this.onLog?.(line);
    }
    async safeStart(s) {
        try {
            await s.start();
            this.backoff.set(s.name, 500);
            this.log(`[supervisor] started ${s.name}`);
        }
        catch (e) {
            this.log(`[supervisor] start failed ${s.name}: ${e}`);
            // keep it in backoff for watchdog to retry
            const b = this.backoff.get(s.name) ?? 500;
            this.backoff.set(s.name, Math.min(30000, b * 2));
        }
    }
    async safeStop(s) {
        try {
            await s.stop();
            this.log(`[supervisor] stopped ${s.name}`);
        }
        catch (e) {
            this.log(`[supervisor] stop failed ${s.name}: ${e}`);
        }
    }
    async watchdogTick() {
        if (!this.running)
            return;
        for (const s of this.services) {
            const st = s.status();
            // If service isn't running, attempt restart with backoff
            if (!st.running) {
                const b = this.backoff.get(s.name) ?? 500;
                await sleep(b);
                if (!this.running)
                    return;
                await this.safeStart(s);
                continue;
            }
            // If running but has lastError, restart it (crash-only restart)
            if (st.lastError) {
                const b = this.backoff.get(s.name) ?? 500;
                this.log(`[supervisor] restarting ${s.name} due to error: ${st.lastError}`);
                await this.safeStop(s);
                await sleep(b);
                if (!this.running)
                    return;
                await this.safeStart(s);
            }
        }
    }
}
