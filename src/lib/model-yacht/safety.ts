import { canQueueOfficial, isProductionModel, isYachtModel } from "../models-v3/registry.ts";
import { promoteChallenger } from "../models-v3/promotion.ts";
import { qualifyOfficial } from "../sports/policy.ts";
import { selectFreePickOfDay } from "../sports/free-pick.ts";
import { livePostingEnabled } from "../desk/production-policy.ts";
import { MODEL_YACHT_MLB_CONTRACT } from "./names.ts";
import type { GameCard, RankPick } from "../sports/types.ts";

/**
 * Model Yacht Candidate is shadow-only. These six gates cannot be true.
 * Production V2 / soak / Discord / truth-gate are untouched.
 */
export const YACHT_SAFETY = {
  canQueueOfficialTickets: false,
  canFreezeOfficialTickets: false,
  canPostOfficialDiscord: false,
  canPostFreeDiscord: false,
  canChangePublicRecord: false,
  canAutoPromote: false,
} as const;

export function yachtCanQueueOfficial(version = MODEL_YACHT_MLB_CONTRACT): boolean {
  return canQueueOfficial(version);
}

export function yachtCanFreezeOfficial(version = MODEL_YACHT_MLB_CONTRACT): boolean {
  return canQueueOfficial(version);
}

export function yachtCanPostOfficialDiscord(version = MODEL_YACHT_MLB_CONTRACT, env: NodeJS.ProcessEnv = {}): boolean {
  return canQueueOfficial(version) && livePostingEnabled(env);
}

export function yachtCanPostFreeDiscord(version = MODEL_YACHT_MLB_CONTRACT): boolean {
  if (canQueueOfficial(version) || isProductionModel(version)) return true;
  return false;
}

export function yachtCanChangePublicRecord(version = MODEL_YACHT_MLB_CONTRACT): boolean {
  return isProductionModel(version) || canQueueOfficial(version);
}

export function yachtCanAutoPromote(version = MODEL_YACHT_MLB_CONTRACT): boolean {
  const r = promoteChallenger({
    version,
    sport: "mlb",
    stats: { n: 500, brier: 0.1, roi: 0.2, clv: 0.05, calibrationDelta: 0.01, maxDrawdown: -2 },
    champion: { n: 500, brier: 0.22, roi: 0.01, clv: 0.001, calibrationDelta: 0.04, maxDrawdown: -8 },
    confirmLive: true,
  });
  if (r.ok && r.status === "candidate" && r.livePosting !== false) return true;
  return false;
}

export function yachtQualifiesOfficial(game: GameCard, postedToday: number, minConf: number): boolean {
  return qualifyOfficial(game, postedToday, minConf);
}

export function yachtFreePickFromDeskOnly() {
  return selectFreePickOfDay([{ id: 1, status: "posted", edgePct: 9, tier: "soft_floor" }]);
}

export function yachtRank(over: Partial<RankPick> = {}): RankPick {
  return {
    market: "moneyline",
    side: "home",
    selection: "LAD ML",
    line: null,
    price: -150,
    edgePct: 12,
    confidence: 80,
    why: "yacht-research",
    model: MODEL_YACHT_MLB_CONTRACT,
    probability: 0.62,
    noVigImplied: 0.54,
    dataQuality: 90,
    passReason: null,
    pickTier: "lock",
    ...over,
  };
}

export function assertYachtShadowOnly(version = MODEL_YACHT_MLB_CONTRACT): void {
  if (!isYachtModel(version)) throw new Error("not a Model Yacht version");
  if (yachtCanQueueOfficial(version)) throw new Error("Yacht must not queue official");
  if (yachtCanFreezeOfficial(version)) throw new Error("Yacht must not freeze official");
  if (yachtCanPostOfficialDiscord(version)) throw new Error("Yacht must not post official Discord");
  if (yachtCanPostFreeDiscord(version)) throw new Error("Yacht must not post free Discord");
  if (yachtCanChangePublicRecord(version)) throw new Error("Yacht must not write public record");
  if (yachtCanAutoPromote(version)) throw new Error("Yacht must not auto-promote");
}
