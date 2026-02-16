export type ServiceStatus = {
  name: string;
  running: boolean;
  lastStartAt?: number;
  lastStopAt?: number;
  lastHeartbeatAt?: number;
  lastError?: string;
};

export interface IService {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): ServiceStatus;
}

/**
 * Minimal lifecycle helper:
 * - idempotent start/stop
 * - abortable loops via AbortController
 * - heartbeat tracking for supervision/telemetry
 */
export abstract class BaseService implements IService {
  public abstract readonly name: string;

  protected runningFlag = false;
  protected abort: AbortController | null = null;

  protected lastStartAt?: number;
  protected lastStopAt?: number;
  protected lastHeartbeatAt?: number;
  protected lastError?: string;

  async start(): Promise<void> {
    if (this.runningFlag) return;
    this.runningFlag = true;
    this.lastStartAt = Date.now();
    this.lastError = undefined;
    this.abort = new AbortController();
    await this.onStart(this.abort.signal);
  }

  async stop(): Promise<void> {
    if (!this.runningFlag) return;
    this.runningFlag = false;
    this.lastStopAt = Date.now();
    try {
      this.abort?.abort();
    } catch { /* ignore */ }
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

  protected heartbeat() {
    this.lastHeartbeatAt = Date.now();
  }

  protected fail(err: unknown) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    this.lastError = msg;
  }

  protected abstract onStart(signal: AbortSignal): Promise<void>;
  protected abstract onStop(): Promise<void>;
}
