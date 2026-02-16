import type { CoinAssessment, ManipulationReason } from "../../types/domain.js";

export type ManipulationScoreInput = {
  trades_15s: number;
  trades_1m: number;
  trades_5m: number;

  uniqBuyers_15s: number;
  uniqBuyers_1m: number;
  uniqBuyers_5m: number;

  solVolume_15s: number;
  solVolume_1m: number;
  solVolume_5m: number;

  cadenceMeanSec_1m?: number;
  cadenceStdSec_1m?: number;
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function clamp100(x: number) { return Math.max(0, Math.min(100, x)); }

export function scoreManipulation(x: ManipulationScoreInput): { risk: number; reasons: Array<{code: ManipulationReason; weight: number; detail: string}> } {
  const reasons: Array<{code: ManipulationReason; weight: number; detail: string}> = [];

  // 1) Volume without users (classic fake volume)
  const users = Math.max(1, x.uniqBuyers_1m);
  const volPerUser = x.solVolume_1m / users;
  // Very high vol/user with low users -> suspicious
  const vwu = clamp01((volPerUser - 1.0) / 5.0) * (users <= 10 ? 1 : 0.4);
  if (vwu > 0.15) reasons.push({ code: "VOLUME_WITHOUT_USERS", weight: vwu, detail: `1m vol/user=${volPerUser.toFixed(2)} SOL with uniq=${x.uniqBuyers_1m}` });

  // 2) Users without volume (spam / bot chatter on-chain without meaningful capital)
  const vol = x.solVolume_1m;
  const uwv = clamp01((x.uniqBuyers_1m - 30) / 60) * (vol < 2 ? 1 : 0.3);
  if (uwv > 0.15) reasons.push({ code: "USERS_WITHOUT_VOLUME", weight: uwv, detail: `1m uniq=${x.uniqBuyers_1m} with low vol=${vol.toFixed(2)} SOL` });

  // 3) Cadence botlike: low std-dev vs mean implies periodic automation
  if (x.cadenceMeanSec_1m != null && x.cadenceStdSec_1m != null && x.trades_1m >= 10) {
    const cv = x.cadenceStdSec_1m / Math.max(0.001, x.cadenceMeanSec_1m);
    const botlike = clamp01((0.35 - cv) / 0.35); // cv < 0.35 suspicious
    if (botlike > 0.15) reasons.push({ code: "CADENCE_BOTLIKE", weight: botlike, detail: `cadence mean=${x.cadenceMeanSec_1m.toFixed(2)}s std=${x.cadenceStdSec_1m.toFixed(2)}s (cv=${cv.toFixed(2)})` });
  }

  // 4) Burst then silence: high 15s, low 5m (or vice versa)
  const burst = x.trades_15s >= 20 && x.trades_5m <= 40;
  if (burst) reasons.push({ code: "BURST_THEN_SILENCE", weight: 0.35, detail: `15s trades=${x.trades_15s} but 5m trades=${x.trades_5m}` });

  // Risk is weighted sum mapped to 0..100
  const risk01 = clamp01(reasons.reduce((a, r) => a + r.weight, 0) / 1.6);
  const risk = clamp100(100 * risk01);
  return { risk, reasons };
}

export function buildAssessment(mint: string, symbol: string | undefined, name: string | undefined, features: ManipulationScoreInput): CoinAssessment {
  const { risk, reasons } = scoreManipulation(features);

  // Real hype: reward users + sustained trades, penalize manipulation
  const sustained = Math.min(1, features.trades_5m / 200);
  const community = Math.min(1, features.uniqBuyers_5m / 120);
  const capital = Math.min(1, features.solVolume_5m / 200);
  const hype01 = 0.45*sustained + 0.35*community + 0.20*capital;
  const realHype = clamp100(100 * (hype01 * (1 - (risk/100)*0.65)));

  const confidence = Math.min(1, (features.trades_1m / 40) * 0.7 + (features.uniqBuyers_1m / 30) * 0.3);

  return {
    mint,
    symbol,
    name,
    ts: Date.now(),
    confidence,
    realHypeScore: realHype,
    manipulationRisk: risk,
    features: {
      trades_15s: features.trades_15s,
      trades_1m: features.trades_1m,
      trades_5m: features.trades_5m,
      uniqBuyers_15s: features.uniqBuyers_15s,
      uniqBuyers_1m: features.uniqBuyers_1m,
      uniqBuyers_5m: features.uniqBuyers_5m,
      solVolume_15s: features.solVolume_15s,
      solVolume_1m: features.solVolume_1m,
      solVolume_5m: features.solVolume_5m,
      cadenceMeanSec_1m: features.cadenceMeanSec_1m,
      cadenceStdSec_1m: features.cadenceStdSec_1m,
    },
    topReasons: reasons
      .sort((a,b)=>b.weight-a.weight)
      .slice(0, 6)
      .map(r => ({ code: r.code, weight: r.weight, detail: r.detail })),
  };
}
