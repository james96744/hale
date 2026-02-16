import type {
  Analytics,
  CandidateToken,
  CoinAssessment,
  RugAlert,
  RugAssessment,
  SecurityAlert,
  SystemStatusSnapshot,
  VitalPoint,
} from "../types/domain.js";

export type CoreState = {
  startedAt?: number;
  status: Analytics["status"];

  analytics: Analytics;
  latestVitals: VitalPoint;

  candidates: Map<string, CandidateToken>;      // mint -> candidate
  rugAssessments: Map<string, RugAssessment>;   // mint -> assessment
  rugAlerts: RugAlert[];                        // recent alerts
  coinAssessments: Map<string, CoinAssessment>; // mint -> manipulation/hype scoring
  securityAlerts: SecurityAlert[];              // recent platform security alerts
  latestSystemStatus?: SystemStatusSnapshot;
  recentEvents: Array<{ ts: number; label: string; key?: string }>;
};

export function makeInitialState(rpcLabel: string, jito: boolean): CoreState {
  const now = Date.now();
  return {
    status: "STOPPED",
    analytics: {
      status: "STOPPED",
      uptimeSec: 0,
      bankrollSOL: 0,
      equitySOL: 0,
      openPositions: 0,
      dailyPnL_SOL: 0,
      totalPnL_SOL: 0,
      winRate: 0,
      avgHoldSec: 0,
      maxDrawdown_SOL: 0,
      lastAction: "boot",
      rpc: rpcLabel,
      jito,
      risk: { maxPosPct: 0.03, maxOpen: 4, stopLossPct: 0.25, dailyLossPct: 0.05 },
    },
    latestVitals: { t: now, equity: 0, pnl: 0, drawdown: 0, winRate: 0, trades: 0 },
    candidates: new Map(),
    rugAssessments: new Map(),
    rugAlerts: [],
    coinAssessments: new Map(),
    securityAlerts: [],
    latestSystemStatus: undefined,
    recentEvents: [],
  };
}
