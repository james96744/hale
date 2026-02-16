import { v4 as uuidv4 } from "uuid";
import { BaseService } from "../core/lifecycle.js";
import type { ServiceStatus } from "../core/lifecycle.js";
import type { EventBus } from "../pipeline/eventBus.js";
import type { AuthSecuritySnapshot } from "../infra/auth.js";
import type { SecurityAlert, SystemStatusSnapshot } from "../types/domain.js";

export type SecuritySentinelConfig = {
  enabled: boolean;
  tickMs: number;
  staleHeartbeatMs: number;
  maxMemoryMb: number;
  maxUnauthorizedPerMin: number;
  autoPauseOnCritical: boolean;
  repeatAlertSuppressionMs: number;
};

export type SecuritySentinelDeps = {
  authSnapshot: () => AuthSecuritySnapshot;
  servicesSnapshot: () => ServiceStatus[];
  isRuntimeRunning: () => boolean;
  onCritical?: (alert: SecurityAlert) => void | Promise<void>;
};

export class SecuritySentinel extends BaseService {
  public readonly name = "securitySentinel";

  private timer: NodeJS.Timeout | null = null;
  private offAny: (() => void) | null = null;
  private eventTimes: number[] = [];
  private alertDedupe = new Map<string, number>();

  constructor(
    private bus: EventBus,
    private cfg: SecuritySentinelConfig,
    private deps: SecuritySentinelDeps
  ) {
    super();
  }

  protected async onStart(signal: AbortSignal): Promise<void> {
    if (!this.cfg.enabled) {
      this.runningFlag = false;
      return;
    }

    this.offAny = this.bus.onAny(() => {
      this.eventTimes.push(Date.now());
    });

    this.timer = setInterval(() => {
      this.heartbeat();
      this.tick();
    }, this.cfg.tickMs);

    signal.addEventListener("abort", () => this.heartbeat(), { once: true });
  }

  protected async onStop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.offAny) this.offAny();
    this.offAny = null;
    this.eventTimes = [];
    this.alertDedupe.clear();
  }

  private tick() {
    const now = Date.now();
    const services = this.deps.servicesSnapshot();
    const auth = this.deps.authSnapshot();
    const memoryRssMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;
    const eventRatePerSec = this.computeEventRate(now, 5_000);
    const serviceHealth = this.serviceHealth(services, now);

    const snapshot: SystemStatusSnapshot = {
      ts: now,
      running: this.deps.isRuntimeRunning(),
      eventRatePerSec,
      memoryRssMb,
      unauthorizedPerMin: auth.unauthorizedPerMin,
      blockedIps: auth.blockedIps,
      services: serviceHealth,
    };

    this.bus.publish("telemetry", "SYSTEM_STATUS", "runtime", snapshot);

    if (auth.unauthorizedPerMin >= this.cfg.maxUnauthorizedPerMin) {
      this.raiseAlert({
        ts: now,
        severity: "CRITICAL",
        source: "auth",
        code: "AUTH_SPIKE",
        message: `Unauthorized traffic spike detected (${auth.unauthorizedPerMin}/min).`,
        context: {
          unauthorizedPerMin: auth.unauthorizedPerMin,
          blockedIps: auth.blockedIps,
        },
      });
    }

    if (memoryRssMb >= this.cfg.maxMemoryMb) {
      this.raiseAlert({
        ts: now,
        severity: "WARN",
        source: "runtime",
        code: "MEMORY_PRESSURE",
        message: `Memory RSS is high (${memoryRssMb} MB).`,
        context: {
          memoryRssMb,
          thresholdMb: this.cfg.maxMemoryMb,
        },
      });
    }

    for (const service of serviceHealth) {
      if (!service.running) {
        if (!snapshot.running) continue;
        if (!service.lastStartAt && !service.lastError) continue;
        this.raiseAlert({
          ts: now,
          severity: "WARN",
          source: "supervisor",
          code: "SERVICE_DOWN",
          message: `Service ${service.name} is not running.`,
          context: { service: service.name },
        });
        continue;
      }

      if (
        service.lastHeartbeatAgeMs != null &&
        service.lastHeartbeatAgeMs > this.cfg.staleHeartbeatMs
      ) {
        this.raiseAlert({
          ts: now,
          severity: "WARN",
          source: "supervisor",
          code: "STALE_HEARTBEAT",
          message: `Service ${service.name} heartbeat is stale.`,
          context: {
            service: service.name,
            lastHeartbeatAgeMs: service.lastHeartbeatAgeMs,
            thresholdMs: this.cfg.staleHeartbeatMs,
          },
        });
      }

      if (service.lastError) {
        this.raiseAlert({
          ts: now,
          severity: "WARN",
          source: "supervisor",
          code: "SERVICE_ERROR",
          message: `Service ${service.name} reported an error.`,
          context: { service: service.name, error: service.lastError },
        });
      }
    }
  }

  private raiseAlert(alert: Omit<SecurityAlert, "id">) {
    const key = `${alert.source}:${alert.code}:${String(alert.context?.service ?? "")}`;
    const now = Date.now();
    const last = this.alertDedupe.get(key) ?? 0;
    if (now - last < this.cfg.repeatAlertSuppressionMs) return;
    this.alertDedupe.set(key, now);

    const full: SecurityAlert = {
      ...alert,
      id: uuidv4(),
    };
    this.bus.publish("risk", "SECURITY_ALERT", full.source, full);

    if (full.severity === "CRITICAL" && this.cfg.autoPauseOnCritical) {
      try {
        const out = this.deps.onCritical?.(full);
        if (out instanceof Promise) {
          void out.catch((e) => this.fail(e));
        }
      } catch (e) {
        this.fail(e);
      }
    }
  }

  private computeEventRate(now: number, windowMs: number): number {
    const cutoff = now - windowMs;
    while (this.eventTimes.length && this.eventTimes[0]! < cutoff) {
      this.eventTimes.shift();
    }
    const rate = this.eventTimes.length / (windowMs / 1000);
    return Math.round(rate * 100) / 100;
  }

  private serviceHealth(services: ServiceStatus[], now: number) {
    return services.map((s) => ({
      name: s.name,
      running: s.running,
      lastStartAt: s.lastStartAt,
      lastStopAt: s.lastStopAt,
      lastHeartbeatAgeMs: s.lastHeartbeatAt ? now - s.lastHeartbeatAt : undefined,
      lastError: s.lastError,
    }));
  }
}
