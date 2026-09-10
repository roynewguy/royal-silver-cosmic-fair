import { clampProb } from "../../models-v3/logreg.ts";
import { plattApply, plattFit } from "../../models-v3/platt.ts";
import { isotonicApply, isotonicFit, type IsotonicModel } from "./isotonic.ts";

export type ProbPair = { p: number; y: 0 | 1 };

export type ReliabilityBucket = {
  key: string;
  lo: number;
  hi: number;
  n: number;
  predicted: number | null;
  actual: number | null;
};

export type CalibrationReport = {
  n: number;
  brier: number | null;
  logLoss: number | null;
  ece: number | null;
  reliability: ReliabilityBucket[];
};

export function brierScore(rows: ProbPair[]): number | null {
  if (!rows.length) return null;
  return rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / rows.length;
}

export function logLossScore(rows: ProbPair[]): number | null {
  if (!rows.length) return null;
  return (
    rows.reduce((s, r) => {
      const p = clampProb(r.p);
      return s + (r.y ? -Math.log(p) : -Math.log(1 - p));
    }, 0) / rows.length
  );
}

export function reliabilityBuckets(rows: ProbPair[], width = 0.1): ReliabilityBucket[] {
  const buckets: ReliabilityBucket[] = [];
  for (let lo = 0; lo < 1; lo += width) {
    const hi = Math.min(1, lo + width);
    const hit = rows.filter((r) => r.p >= lo && (hi >= 1 ? r.p <= hi : r.p < hi));
    buckets.push({
      key: `${lo.toFixed(2)}-${hi.toFixed(2)}`,
      lo,
      hi,
      n: hit.length,
      predicted: hit.length ? hit.reduce((s, r) => s + r.p, 0) / hit.length : null,
      actual: hit.length ? hit.reduce((s, r) => s + r.y, 0) / hit.length : null,
    });
  }
  return buckets;
}

/** Expected calibration error, weighted by bucket size. */
export function expectedCalibrationError(rows: ProbPair[], width = 0.1): number | null {
  if (!rows.length) return null;
  const buckets = reliabilityBuckets(rows, width);
  let acc = 0;
  for (const b of buckets) {
    if (!b.n || b.predicted == null || b.actual == null) continue;
    acc += (b.n / rows.length) * Math.abs(b.predicted - b.actual);
  }
  return acc;
}

export function calibrationReport(rows: ProbPair[]): CalibrationReport {
  return {
    n: rows.length,
    brier: brierScore(rows),
    logLoss: logLossScore(rows),
    ece: expectedCalibrationError(rows),
    reliability: reliabilityBuckets(rows),
  };
}

export type Calibrator =
  | { method: "none" }
  | { method: "platt"; a: number; b: number }
  | { method: "isotonic"; model: IsotonicModel };

/**
 * Fit calibration on out-of-fold / walk-forward validation predictions.
 * Never call this on the final test set.
 */
export function fitCalibrator(valid: ProbPair[], method: "none" | "platt" | "isotonic"): Calibrator {
  if (method === "none" || valid.length < 40) return { method: "none" };
  if (method === "platt") {
    const { a, b } = plattFit(valid);
    return { method: "platt", a, b };
  }
  return { method: "isotonic", model: isotonicFit(valid) };
}

export function applyCalibrator(p: number, cal: Calibrator): number {
  if (cal.method === "platt") return plattApply(p, { a: cal.a, b: cal.b });
  if (cal.method === "isotonic") return isotonicApply(p, cal.model);
  return clampProb(p);
}
