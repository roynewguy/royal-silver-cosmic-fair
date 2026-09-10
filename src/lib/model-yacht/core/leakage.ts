import { assertNoFutureGames, priorGames, rowUsesScoresAsFeatures } from "../../models-v3/leakage.ts";
import type { HistoricalGame } from "../../models-v3/types.ts";
import { assertNoFutureFeature, featureKeyIsCloseOrResult, type YachtFeature } from "./provenance.ts";

/** Conservative default. Sport adapters should pass their own buffer (MLB 3.5h, football 4h, …). */
export const DEFAULT_PRIOR_COMPLETE_MS = 4 * 3_600_000;

export function yachtPriorGames(
  all: HistoricalGame[],
  teamAbbr: string,
  predictionAt: string,
  completeMs = DEFAULT_PRIOR_COMPLETE_MS,
): HistoricalGame[] {
  const cut = Date.parse(predictionAt);
  const raw = priorGames(all, teamAbbr, predictionAt);
  assertNoFutureGames(raw, predictionAt);
  return raw.filter((g) => {
    const start = Date.parse(g.startAt);
    if (!Number.isFinite(start) || !Number.isFinite(cut)) return false;
    return start + completeMs <= cut;
  });
}

/** When a prior result is treated as known: start + sport completion buffer. */
export function priorKnownAt(startAt: string, completeMs: number): string | null {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start)) return null;
  return new Date(start + completeMs).toISOString();
}

export function assertChronologicalRows(startAts: string[]): void {
  let prev = -Infinity;
  for (const s of startAts) {
    const t = Date.parse(s);
    if (!Number.isFinite(t)) throw new Error(`leak: bad startAt ${s}`);
    if (t < prev) throw new Error("leak: dataset is not chronological");
    prev = t;
  }
}

export function assertPredictionBeforeStart(predictionAt: string, startAt: string): void {
  if (Date.parse(predictionAt) >= Date.parse(startAt)) {
    throw new Error(`leak: prediction_at ${predictionAt} is not before start ${startAt}`);
  }
}

export function assertFeatureSetClean(features: YachtFeature[], predictionAt: string): void {
  for (const f of features) {
    if (f.predictionAt !== predictionAt) throw new Error(`leak: feature ${f.key} prediction_at mismatch`);
    assertNoFutureFeature(f);
    if (featureKeyIsCloseOrResult(f.key)) {
      throw new Error(`leak: feature key ${f.key} is a close/result field`);
    }
  }
  const json = JSON.stringify(features.map((f) => ({ key: f.key, value: f.value })));
  if (rowUsesScoresAsFeatures(json)) {
    throw new Error("leak: feature payload mentions scores or close");
  }
}

export function closingOnlyOnMarket(features: YachtFeature[], closeHome: number | null, closeAway: number | null): void {
  const blob = JSON.stringify(features);
  if (closeHome != null && blob.includes(String(closeHome))) {
    throw new Error("leak: closing home price appeared in features");
  }
  if (closeAway != null && blob.includes(String(closeAway))) {
    throw new Error("leak: closing away price appeared in features");
  }
}
