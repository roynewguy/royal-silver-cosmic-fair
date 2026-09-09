import { clamp, impliedFromAmerican } from "./odds.ts";
import type { Market, PassReason } from "./types.ts";

/** Official bets need a real data-quality floor. Ranking display can still show near-misses. */
export const OFFICIAL_MIN_QUALITY = 70;
export const OFFICIAL_MAX_UNCERTAINTY = 0.42;
export const MARKET_DISAGREE_PROB = 0.035;

export type BetAction = "BET" | "PASS";

export type BetOpportunityInput = {
  modelProbability: number;
  marketProbability: number | null;
  price: number | null;
  line?: number | null;
  dataQuality: number;
  modelUncertainty: number;
  marketAgeMs: number | null;
  sport: string;
  marketType: Market;
  minEdgePct: number;
  minConfidence: number;
  confidence: number;
  passReason?: PassReason | null;
  consensusProb?: number | null;
  consensusDispersion?: number | null;
  openPrice?: number | null;
  modelVersion?: string | null;
};

export type BetDecision = {
  action: BetAction;
  edgePct: number;
  expectedValuePct: number;
  confidence: number;
  uncertainty: number;
  dataQuality: number;
  reason: PassReason | "BET";
  detail: string;
};

/** Profit in units on a 1u risk if the bet wins. */
export function americanProfit(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return 0;
  if (odds < 0) return 100 / Math.abs(odds);
  return odds / 100;
}

function orGuard(odds: number): boolean {
  return Number.isFinite(odds) && odds !== 0;
}

/** EV as a percent of stake. At -110, p=0.55 → about +4.5%. Not the same as model edge. */
export function expectedValuePct(modelProbability: number, americanOdds: number): number {
  if (!orGuard(americanOdds)) return 0;
  const p = clamp(modelProbability, 0, 1);
  const profit = americanProfit(americanOdds);
  return (p * profit - (1 - p) * 1) * 100;
}

export function modelEdgePct(modelProbability: number, marketProbability: number | null): number {
  if (marketProbability == null || !Number.isFinite(marketProbability)) return 0;
  return (modelProbability - marketProbability) * 100;
}

export function lineMovedAgainst(openPrice: number | null | undefined, currentPrice: number | null | undefined): boolean {
  if (openPrice == null || currentPrice == null) return false;
  const openImp = impliedFromAmerican(openPrice);
  const nowImp = impliedFromAmerican(currentPrice);
  return nowImp - openImp >= 0.025;
}

export function evaluateBetOpportunity(input: BetOpportunityInput): BetDecision {
  const uncertainty = clamp(input.modelUncertainty, 0, 1);
  const dataQuality = clamp(input.dataQuality, 0, 100);
  const confidence = Math.round(clamp(input.confidence, 0, 100));
  const edgePct = modelEdgePct(input.modelProbability, input.marketProbability);
  const expectedValuePctValue =
    input.price != null && Number.isFinite(input.price) ? expectedValuePct(input.modelProbability, input.price) : 0;

  const fail = (reason: PassReason, detail: string): BetDecision => ({
    action: "PASS",
    edgePct,
    expectedValuePct: expectedValuePctValue,
    confidence,
    uncertainty,
    dataQuality,
    reason,
    detail,
  });

  if (input.passReason) return fail(input.passReason, input.passReason);
  if (!Number.isFinite(input.modelProbability) || input.modelProbability <= 0 || input.modelProbability >= 1) {
    return fail("PASS_CRITICAL_DATA_MISSING", "Model probability not in (0,1).");
  }
  if (input.price == null || !orGuard(input.price)) {
    return fail("PASS_DK_UNAVAILABLE", "No verified price.");
  }
  if (input.marketProbability == null) {
    return fail("PASS_MARKET_INCOMPLETE", "Both sides of the no-vig market are required.");
  }
  if (dataQuality < OFFICIAL_MIN_QUALITY) {
    return fail("PASS_LOW_DATA_QUALITY", `Data quality ${Math.round(dataQuality)} below ${OFFICIAL_MIN_QUALITY}.`);
  }
  if (uncertainty > OFFICIAL_MAX_UNCERTAINTY) {
    return fail("PASS_HIGH_UNCERTAINTY", `Uncertainty ${(uncertainty * 100).toFixed(0)} too high.`);
  }
  if (input.marketAgeMs != null && input.marketAgeMs > 20 * 60_000) {
    return fail("PASS_MARKET_STALE", "Market snapshot is stale.");
  }
  if (edgePct < input.minEdgePct) {
    return fail(edgePct <= 0 ? "PASS_NO_EDGE" : "PASS_EDGE_TOO_SMALL", `Edge ${edgePct.toFixed(1)}% below ${input.minEdgePct}.`);
  }
  if (expectedValuePctValue <= 0) {
    return fail("PASS_PRICE_TOO_BAD", `Expected value ${expectedValuePctValue.toFixed(1)}% is not positive.`);
  }
  if (confidence < input.minConfidence) {
    return fail("PASS_LOW_CONFIDENCE", `Confidence ${confidence} below ${input.minConfidence}.`);
  }
  if (
    input.consensusDispersion != null &&
    input.consensusDispersion >= MARKET_DISAGREE_PROB &&
    input.consensusProb != null &&
    Math.abs(input.modelProbability - input.consensusProb) < input.minEdgePct / 100
  ) {
    return fail("PASS_MARKET_DISAGREEMENT", "Books disagree and the model is not clearly off-market.");
  }
  if (lineMovedAgainst(input.openPrice, input.price) && expectedValuePctValue < input.minEdgePct) {
    return fail("PASS_LINE_MOVED", "Line moved and remaining EV is too thin.");
  }

  return {
    action: "BET",
    edgePct,
    expectedValuePct: expectedValuePctValue,
    confidence,
    uncertainty,
    dataQuality,
    reason: "BET",
    detail: `Edge ${edgePct.toFixed(1)}% · EV ${expectedValuePctValue.toFixed(1)}%.`,
  };
}

export function uncertaintyFromQuality(opts: {
  dataQuality: number;
  missingCount: number;
  marketAgeMs: number | null;
  modelDisagreement?: number | null;
}): number {
  const qualityGap = clamp((100 - opts.dataQuality) / 100, 0, 1);
  const missing = clamp(opts.missingCount / 14, 0, 0.22);
  const stale = opts.marketAgeMs != null && opts.marketAgeMs > 12 * 60_000 ? 0.12 : 0;
  const disagree = clamp(Math.abs(opts.modelDisagreement ?? 0) * 1.6, 0, 0.35);
  return clamp(0.06 + qualityGap * 0.35 + missing + stale + disagree, 0.05, 0.9);
}
