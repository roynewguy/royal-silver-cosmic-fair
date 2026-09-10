export type YachtFeatureValue = number | string | boolean | null;

export type YachtFeature = {
  key: string;
  value: YachtFeatureValue;
  source: string;
  /** When this input became knowable. Null = unproven. Never invent from predictionAt. */
  knownAt: string | null;
  capturedAt: string | null;
  predictionAt: string;
  missing: boolean;
  /** 0–1. Missing or unproven is 0. */
  quality: number;
  usable: boolean;
};

export type YachtMarketSnapshot = {
  sportsbook: string;
  /** Timestamp for the current quote. Null = unproven. */
  capturedAt: string | null;
  /** Timestamp for the opening quote. Null = unproven. Do not stamp predictionAt. */
  openCapturedAt: string | null;
  /** Timestamp for the closing quote. Evaluation-only. */
  closeCapturedAt: string | null;
  homeOpen: number | null;
  awayOpen: number | null;
  homeCurrent: number | null;
  awayCurrent: number | null;
  /** Evaluation-only. Never a feature. Never a stake. */
  homeClose: number | null;
  awayClose: number | null;
  source: string;
};

export type ProvenTwoWay = {
  home: number;
  away: number;
  kind: "open" | "current";
  capturedAt: string;
};

export function knownAtOrBefore(knownAt: string | null | undefined, predictionAt: string): boolean {
  if (!knownAt) return false;
  const k = Date.parse(knownAt);
  const p = Date.parse(predictionAt);
  if (!Number.isFinite(k) || !Number.isFinite(p)) return false;
  return k <= p;
}

export function featureUsable(input: {
  value: YachtFeatureValue;
  knownAt: string | null;
  predictionAt: string;
  missing?: boolean;
  quality?: number;
}): boolean {
  if (input.missing) return false;
  if (input.value == null || input.value === "") return false;
  if ((input.quality ?? 1) <= 0) return false;
  return knownAtOrBefore(input.knownAt, input.predictionAt);
}

export function makeFeature(input: {
  key: string;
  value: YachtFeatureValue;
  source: string;
  knownAt: string | null;
  capturedAt: string | null;
  predictionAt: string;
  missing?: boolean;
  quality?: number;
}): YachtFeature {
  const missing = input.missing === true || input.value == null || input.value === "";
  const quality = missing ? 0 : Math.max(0, Math.min(1, input.quality ?? 1));
  const usable = featureUsable({
    value: input.value,
    knownAt: input.knownAt,
    predictionAt: input.predictionAt,
    missing,
    quality,
  });
  return {
    key: input.key,
    value: missing ? null : input.value,
    source: input.source,
    knownAt: input.knownAt,
    capturedAt: input.capturedAt,
    predictionAt: input.predictionAt,
    missing,
    quality: usable ? quality : 0,
    usable,
  };
}

/** If known_at cannot be proven <= prediction_at, Model Yacht cannot use the feature. */
export function assertNoFutureFeature(feature: YachtFeature): void {
  if (!feature.usable) return;
  if (!knownAtOrBefore(feature.knownAt, feature.predictionAt)) {
    throw new Error(`leak: ${feature.key} known_at ${feature.knownAt} after prediction_at ${feature.predictionAt}`);
  }
}

const CLOSE_OR_RESULT_KEY = /^(close|closing|home_score|away_score|homeScore|awayScore|score|home_win|result|postgame)$/i;

export function featureJsonLeaksCloseOrResult(json: string): boolean {
  return /"(close|closing|homeScore|awayScore|home_score|away_score|score|home_win|result|postgame)"/i.test(json);
}

export function featureKeyIsCloseOrResult(key: string): boolean {
  return CLOSE_OR_RESULT_KEY.test(key);
}

/** Numeric two-way only. Does not prove the quote existed at prediction time. */
export function twoWayPregame(market: Pick<YachtMarketSnapshot, "homeOpen" | "awayOpen" | "homeCurrent" | "awayCurrent">): {
  home: number;
  away: number;
  kind: "open" | "current";
} | null {
  if (market.homeOpen != null && market.awayOpen != null) return { home: market.homeOpen, away: market.awayOpen, kind: "open" };
  if (market.homeCurrent != null && market.awayCurrent != null) return { home: market.homeCurrent, away: market.awayCurrent, kind: "current" };
  return null;
}

/**
 * Honest prediction-time market. A quote without a real captured timestamp is audit-only.
 * Never treat predictionAt as proof the book had that price.
 */
export function provenPregameTwoWay(market: YachtMarketSnapshot, predictionAt: string): ProvenTwoWay | null {
  if (
    market.homeOpen != null &&
    market.awayOpen != null &&
    knownAtOrBefore(market.openCapturedAt, predictionAt)
  ) {
    return { home: market.homeOpen, away: market.awayOpen, kind: "open", capturedAt: market.openCapturedAt! };
  }
  if (
    market.homeCurrent != null &&
    market.awayCurrent != null &&
    knownAtOrBefore(market.capturedAt, predictionAt)
  ) {
    return { home: market.homeCurrent, away: market.awayCurrent, kind: "current", capturedAt: market.capturedAt! };
  }
  return null;
}

export function snapshotProvenanceOk(input: {
  predictionAt: string;
  startAt: string;
  market: YachtMarketSnapshot;
  features: YachtFeature[];
}): boolean {
  if (!Number.isFinite(Date.parse(input.predictionAt)) || !Number.isFinite(Date.parse(input.startAt))) return false;
  if (Date.parse(input.predictionAt) >= Date.parse(input.startAt)) return false;
  const pair = provenPregameTwoWay(input.market, input.predictionAt);
  if (!pair) return false;
  for (const f of input.features) {
    if (!f.usable) continue;
    if (!knownAtOrBefore(f.knownAt, input.predictionAt)) return false;
  }
  return true;
}
