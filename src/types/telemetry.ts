import type {
  Analytics,
  CandidateToken,
  CoinAssessment,
  RugAlert,
  RugAssessment,
  SecurityAlert,
  SystemStatusSnapshot,
  VitalPoint,
} from "./domain.js";

export type TelemetryMessage =
  | { type: "analytics"; data: Analytics }
  | { type: "vitals"; data: VitalPoint }
  | { type: "candidates"; data: CandidateToken[] }
  | { type: "events"; data: Array<{ ts: number; label: string; key?: string }> }
  | { type: "rug_assessment"; data: RugAssessment }
  | { type: "rug_alert"; data: RugAlert }
  | { type: "assessment"; data: CoinAssessment }
  | { type: "system_status"; data: SystemStatusSnapshot }
  | { type: "security_alert"; data: SecurityAlert };
