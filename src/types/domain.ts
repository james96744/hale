export type BotStatus = "STOPPED" | "RUNNING" | "ERROR";

export type RugRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SecuritySeverity = "INFO" | "WARN" | "CRITICAL";

export type VitalPoint = {
  t: number;        // unix ms
  equity: number;   // SOL (or USD if you prefer)
  pnl: number;      // SOL
  drawdown: number; // SOL (<=0)
  winRate: number;  // 0..1
  trades: number;   // cumulative
};

export type Analytics = {
  status: BotStatus;
  uptimeSec: number;
  bankrollSOL: number;
  equitySOL: number;
  openPositions: number;
  dailyPnL_SOL: number;
  totalPnL_SOL: number;
  winRate: number;
  avgHoldSec: number;
  maxDrawdown_SOL: number;
  lastAction: string;
  rpc: string;
  jito: boolean;
  risk: {
    maxPosPct: number;
    maxOpen: number;
    stopLossPct: number;
    dailyLossPct: number;
  };
};

export type CandidateToken = {
  mint: string;
  symbol?: string;
  name?: string;
  score: number;          // 0..100
  curveProgress?: number; // 0..1 (pump.fun bonding curve)
  velocity?: number;      // buyers/min
  accel?: number;         // delta velocity
  solInflowPerMin?: number;
  uniqueBuyers?: number;
  ts: number;
};

export type RugSignal = {
  code: string;
  severity: 1 | 2 | 3 | 4;
  message: string;
  weight: number;  // 0..1
  at: number;      // unix ms
};

export type RugAssessment = {
  mint: string;
  symbol?: string;
  level: RugRiskLevel;
  score: number; // 0..100
  signals: RugSignal[];
  lastUpdated: number;
};

export type RugAlert = {
  t: number;
  mint: string;
  symbol?: string;
  level: RugRiskLevel;
  score: number;
  reason: string; // short label
};


export type ManipulationReason =
  | "CADENCE_BOTLIKE"
  | "VOLUME_WITHOUT_USERS"
  | "USERS_WITHOUT_VOLUME"
  | "BURST_THEN_SILENCE"
  | "UNIFORM_TRADE_SIZES"
  | "UNKNOWN";

export type CoinAssessment = {
  mint: string;
  symbol?: string;
  name?: string;

  ts: number;
  confidence: number; // 0..1

  // Scores 0..100
  realHypeScore: number;
  manipulationRisk: number;

  // Feature snapshots (rolling)
  features: {
    trades_15s: number;
    trades_1m: number;
    trades_5m: number;

    uniqBuyers_15s: number;
    uniqBuyers_1m: number;
    uniqBuyers_5m: number;

    solVolume_15s: number;
    solVolume_1m: number;
    solVolume_5m: number;

    cadenceStdSec_1m?: number;  // std-dev of inter-arrival times
    cadenceMeanSec_1m?: number; // mean inter-arrival time
  };

  topReasons: Array<{
    code: ManipulationReason | string;
    weight: number; // 0..1
    detail: string;
  }>;
};

export type SecurityAlert = {
  id: string;
  ts: number;
  severity: SecuritySeverity;
  source: string;
  code: string;
  message: string;
  context?: Record<string, string | number | boolean>;
};

export type ServiceHealth = {
  name: string;
  running: boolean;
  lastStartAt?: number;
  lastStopAt?: number;
  lastHeartbeatAgeMs?: number;
  lastError?: string;
};

export type SystemStatusSnapshot = {
  ts: number;
  running: boolean;
  eventRatePerSec: number;
  memoryRssMb: number;
  unauthorizedPerMin: number;
  blockedIps: number;
  services: ServiceHealth[];
};
