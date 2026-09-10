import { clvSelectedSide } from "../../models-v3/evaluate.ts";
import { featureKeyIsCloseOrResult } from "../core/provenance.ts";
import type { ChallengerPrediction } from "./prediction.ts";
import { challengerPrediction } from "./prediction.ts";

export type ShadowRecord = ChallengerPrediction;

export type ShadowStore = {
  records: ShadowRecord[];
};

export function emptyShadowStore(): ShadowStore {
  return { records: [] };
}

export function persistShadow(store: ShadowStore, pred: ChallengerPrediction): ShadowRecord {
  if (pred.official !== false) throw new Error("shadow record must be official=false");
  if (featureKeyIsCloseOrResult(pred.featureSnapshotId) && pred.closingLine != null) {
    throw new Error("closing line cannot be stored as a feature snapshot id");
  }
  const frozen: ShadowRecord = { ...pred, official: false, result: pred.result, closingLine: pred.closingLine, clv: pred.clv };
  store.records.push(frozen);
  return frozen;
}

/**
 * Result / close / CLV join later for evaluation. They never rewrite probability
 * or the feature snapshot.
 */
export function attachEvaluation(
  pred: ShadowRecord,
  input: { result: 0 | 1; closeHome: number | null; closeAway: number | null; stakeHome: number; stakeAway: number; betHome: boolean },
): ShadowRecord {
  const close = input.betHome ? input.closeHome : input.closeAway;
  const stake = input.betHome ? input.stakeHome : input.stakeAway;
  return challengerPrediction({
    ...pred,
    official: false,
    result: input.result,
    closingLine: close,
    clv: clvSelectedSide(stake, close),
  });
}

export function shadowDoesNotChangePublicRecord(pred: ChallengerPrediction): true {
  if (pred.official) throw new Error("shadow leaked official=true");
  return true;
}

export type ChallengerCompareRow = {
  championP: number;
  challengerP: number;
  y: 0 | 1;
  clv: number | null;
  dataQuality: number;
};

export function compareOnIdenticalOpportunities(rows: ChallengerCompareRow[]): {
  n: number;
  championBrier: number | null;
  challengerBrier: number | null;
  avgClv: number | null;
  avgQuality: number | null;
} {
  if (!rows.length) return { n: 0, championBrier: null, challengerBrier: null, avgClv: null, avgQuality: null };
  const champ = rows.reduce((s, r) => s + (r.championP - r.y) ** 2, 0) / rows.length;
  const chal = rows.reduce((s, r) => s + (r.challengerP - r.y) ** 2, 0) / rows.length;
  const clvs = rows.map((r) => r.clv).filter((x): x is number => x != null);
  return {
    n: rows.length,
    championBrier: champ,
    challengerBrier: chal,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
    avgQuality: rows.reduce((s, r) => s + r.dataQuality, 0) / rows.length,
  };
}

/**
 * Yacht intelligence failures must not break V2 scan / truth gate / soak.
 */
export function runChallengerSafe<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
