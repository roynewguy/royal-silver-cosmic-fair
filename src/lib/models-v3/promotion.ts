import { canQueueOfficial, catalogCard, DEFAULT_REGISTRY } from "./registry.ts";
import type { ModelCard } from "../sports/types.ts";

export const MIN_FORWARD_BETS = 300;
export const MAX_CALIBRATION_DELTA = 0.08;
export const MAX_DRAWDOWN_UNITS = -20;

export type ForwardStats = {
  n: number;
  brier: number | null;
  roi: number | null;
  clv: number | null;
  calibrationDelta: number | null;
  maxDrawdown: number | null;
};

export function emptyStats(): ForwardStats {
  return { n: 0, brier: null, roi: null, clv: null, calibrationDelta: null, maxDrawdown: null };
}

export function eligibilityReasons(challenger: ForwardStats, champion: ForwardStats): string[] {
  const reasons: string[] = [];
  if (challenger.n < MIN_FORWARD_BETS) reasons.push(`Need ${MIN_FORWARD_BETS}+ forward shadow bets (${challenger.n}).`);
  if (challenger.clv == null || challenger.clv <= 0) reasons.push("Need positive forward CLV.");
  if (challenger.roi == null || challenger.roi <= 0) reasons.push("Need positive forward ROI.");
  if (challenger.brier == null || champion.brier == null || challenger.brier >= champion.brier) {
    reasons.push("Need a better Brier score than the champion.");
  }
  if (challenger.calibrationDelta != null && Math.abs(challenger.calibrationDelta) > MAX_CALIBRATION_DELTA) {
    reasons.push("Calibration is too far off.");
  }
  if (challenger.maxDrawdown != null && challenger.maxDrawdown < MAX_DRAWDOWN_UNITS) {
    reasons.push("Max drawdown is too large.");
  }
  return reasons;
}

export function isEligible(challenger: ForwardStats, champion: ForwardStats): boolean {
  return eligibilityReasons(challenger, champion).length === 0;
}

export type PromoteResult = {
  ok: boolean;
  livePosting: false;
  status: "candidate" | "shadow";
  note: string;
};

/** Operator action only. Never auto. Never switches live Discord posting off V2. */
export function promoteChallenger(input: {
  version: string;
  sport: string;
  stats: ForwardStats;
  champion: ForwardStats;
  confirmLive?: boolean;
}): PromoteResult {
  if (canQueueOfficial(input.version)) {
    return {
      ok: false,
      livePosting: false,
      status: "shadow",
      note: "Champion is already live. Promotion is for challengers.",
    };
  }
  if (input.confirmLive) {
    return {
      ok: false,
      livePosting: false,
      status: "shadow",
      note: "Lab candidate mark cannot switch the live champion. Use CEO sport-champion promotion after verification. V2 remains the default until then.",
    };
  }
  if (!isEligible(input.stats, input.champion)) {
    return {
      ok: false,
      livePosting: false,
      status: "shadow",
      note: eligibilityReasons(input.stats, input.champion).join(" "),
    };
  }
  return {
    ok: true,
    livePosting: false,
    status: "candidate",
    note: `${input.version} marked candidate for ${input.sport}. It still cannot post official Discord picks. V2 stays champion.`,
  };
}

export function rollbackToV2(sport: string): PromoteResult {
  const v2 = DEFAULT_REGISTRY.find((e) => e.sport === sport && e.role === "champion");
  return {
    ok: true,
    livePosting: false,
    status: "shadow",
    note: `Rolled ${sport} challenger back. Live champion remains ${v2?.modelVersion ?? "v2"}.`,
  };
}

export function defaultLabCards(): ModelCard[] {
  return DEFAULT_REGISTRY.map((e) => catalogCard(e, { livePosting: canQueueOfficial(e.modelVersion) }));
}
