import { createHash } from "node:crypto";
import { MODEL_YACHT_MLB_CONTRACT } from "./names.ts";

export type YachtFeatureValue = number | string | boolean | null;

export type YachtFeature = {
  key: string;
  value: YachtFeatureValue;
  source: string;
  /** When this input became knowable. Null = unproven. */
  knownAt: string | null;
  capturedAt: string | null;
  predictionAt: string;
  missing: boolean;
  /** 0–1. Missing or unproven is 0. */
  quality: number;
  usable: boolean;
};

export type YachtMarketQuote = {
  sportsbook: string;
  capturedAt: string | null;
  homePrice: number | null;
  awayPrice: number | null;
  source: string;
};

export type YachtMarketSnapshot = {
  sportsbook: string;
  capturedAt: string | null;
  homeOpen: number | null;
  awayOpen: number | null;
  homeCurrent: number | null;
  awayCurrent: number | null;
  /** Evaluation-only. Never a feature. Never a stake. */
  homeClose: number | null;
  awayClose: number | null;
  source: string;
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

export function snapshotIdFrom(parts: Array<string | number | null | undefined>): string {
  const h = createHash("sha256");
  h.update(MODEL_YACHT_MLB_CONTRACT);
  h.update("\n");
  for (const p of parts) {
    h.update(String(p ?? ""));
    h.update("\0");
  }
  return `yacht_${h.digest("hex").slice(0, 24)}`;
}

const CLOSE_OR_RESULT_KEY = /^(close|closing|home_score|away_score|homeScore|awayScore|score|home_win|result|postgame)$/i;

export function featureJsonLeaksCloseOrResult(json: string): boolean {
  return /"(close|closing|homeScore|awayScore|home_score|away_score|score|home_win|result|postgame)"/i.test(json);
}

export function featureKeyIsCloseOrResult(key: string): boolean {
  return CLOSE_OR_RESULT_KEY.test(key);
}

export function twoWayPregame(market: Pick<YachtMarketSnapshot, "homeOpen" | "awayOpen" | "homeCurrent" | "awayCurrent">): {
  home: number;
  away: number;
  kind: "open" | "current";
} | null {
  if (market.homeOpen != null && market.awayOpen != null) return { home: market.homeOpen, away: market.awayOpen, kind: "open" };
  if (market.homeCurrent != null && market.awayCurrent != null) return { home: market.homeCurrent, away: market.awayCurrent, kind: "current" };
  return null;
}
