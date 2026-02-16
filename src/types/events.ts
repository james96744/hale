import type { CandidateToken, RugAlert, RugAssessment } from "./domain.js";
import type { CoinAssessment, SecurityAlert, SystemStatusSnapshot } from "./domain.js";

export type Topic = "pumpfun" | "raydium" | "market" | "risk" | "trade" | "telemetry";

export type EventType =
  | "PUMPFUN_NEW_TOKEN"
  | "PUMPFUN_TRADE_TICK"
  | "PUMPFUN_SCORE_UPDATE"
  | "RAYDIUM_POOL_CREATED"
  | "RAYDIUM_LIQUIDITY_CHANGED"
  | "RAYDIUM_SWAP_TICK"
  | "MIGRATION_DETECTED"
  | "RUG_ASSESSMENT"
  | "RUG_ALERT"
  | "SYSTEM_STATUS"
  | "COIN_ASSESSMENT_UPDATED"
  | "MANIPULATION_ALERT"
  | "SECURITY_ALERT"
  | "DEBUG_EVENT";

export type RelayEvent<T = unknown> = {
  id: string;   // uuid
  ts: number;   // unix ms
  topic: Topic;
  type: EventType;
  key: string;  // mint or pool id (partition key)
  data: T;
};

// Event payloads (stubs—expand as you implement)
export type PumpfunNewToken = {
  mint: string;
  symbol?: string;
  name?: string;
  creator?: string;
  metadataUri?: string;
  slot?: number;
};

export type PumpfunTradeTick = {
  mint: string;
  side: "BUY" | "SELL";
  solAmount: number;
  buyer?: string;
  curveProgress?: number; // 0..1
  txSig?: string;
};

export type PumpfunScoreUpdate = CandidateToken;

export type RaydiumPoolCreated = {
  poolId: string;
  baseMint: string;
  quoteMint: string;
  lpMint?: string;
  creator?: string;
  ts: number;
};

export type RaydiumLiquidityChanged = {
  poolId: string;
  baseMint: string;
  quoteMint: string;
  baseLiquidity: number;
  quoteLiquidity: number;
  pctChange: number; // -1..+inf
  ts: number;
};

export type RaydiumSwapTick = {
  poolId: string;
  baseMint: string;
  quoteMint: string;
  price: number;
  volumeQuote: number;
  txSig?: string;
  ts: number;
};

export type MigrationDetected = {
  mint: string;
  poolId: string;
  liquiditySOL?: number;
  timeFromLaunchSec?: number;
  ts: number;
};

export type RiskAssessmentEvent = RugAssessment;
export type RiskAlertEvent = RugAlert;


export type CoinAssessmentUpdated = CoinAssessment;

export type ManipulationAlert = {
  mint: string;
  ts: number;
  risk: number; // 0..100
  reasons: string[];
};

export type SystemStatusEvent = SystemStatusSnapshot;
export type SecurityAlertEvent = SecurityAlert;
