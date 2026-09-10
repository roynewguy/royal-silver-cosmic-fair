import { calibrationReport, type CalibrationReport, type ProbPair } from "../../calibration.ts";
import { honestBacktest, type SideEval } from "../../../../models-v3/evaluate.ts";
import { gbtFeatureImportance } from "../../models/gbt.ts";
import { NFL_VECTOR_KEYS } from "./vector.ts";
import type { NflFoldFit, NflTrainRow } from "./train.ts";
import { predictNflFold } from "./train.ts";
import { marketBaseline } from "../../market.ts";

const RESEARCH_EDGE = 0.03;

export type NflModelReport = {
  candidate: "logreg" | "gbt" | "market" | "v2";
  sampleSize: number;
  dateRange: { from: string | null; to: string | null };
  calibration: CalibrationReport;
  accuracy: number | null;
  roi: number | null;
  clv: number | null;
  units: number | null;
  nStaked: number;
  featureMissingness: Record<string, number>;
  dataQuality: { mean: number | null };
};

function accuracy(rows: ProbPair[]): number | null {
  if (!rows.length) return null;
  return rows.filter((r) => (r.p >= 0.5 ? 1 : 0) === r.y).length / rows.length;
}

function stakeRows(rows: NflTrainRow[], pairs: ProbPair[]): SideEval[] {
  return rows.map((row, i) => ({
    p: pairs[i].p,
    y: pairs[i].y,
    stakePrice: row.homeOpen,
    closePrice: row.closeHome,
    homePrice: row.homeOpen,
    awayPrice: row.awayOpen,
    closeHome: row.closeHome,
    closeAway: row.closeAway,
    homeOpen: row.homeOpen,
    awayOpen: row.awayOpen,
  }));
}

function missingness(rows: NflTrainRow[]): Record<string, number> {
  if (!rows.length) return {};
  const keys = ["home_win_pct", "open_no_vig_home", "qb_out_home", "epa_off", "cpoe", "wind_mph"];
  const out: Record<string, number> = {};
  for (const k of keys) {
    const miss = rows.filter((r) => !r.features.some((f) => f.key === k && f.usable)).length;
    out[k] = miss / rows.length;
  }
  return out;
}

export function reportNflCandidate(
  rows: NflTrainRow[],
  pairs: ProbPair[],
  candidate: NflModelReport["candidate"],
  quality?: number[],
): NflModelReport {
  const staked = honestBacktest(stakeRows(rows, pairs), RESEARCH_EDGE);
  const qs = quality ?? [];
  return {
    candidate,
    sampleSize: pairs.length,
    dateRange: { from: rows[0]?.startAt ?? null, to: rows.at(-1)?.startAt ?? null },
    calibration: calibrationReport(pairs),
    accuracy: accuracy(pairs),
    roi: staked.roi,
    clv: staked.avgClv,
    units: staked.units,
    nStaked: staked.n,
    featureMissingness: missingness(rows),
    dataQuality: { mean: qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null },
  };
}

export function reportNflWalkForward(rows: NflTrainRow[], fit: NflFoldFit): {
  logreg: NflModelReport;
  gbt: NflModelReport;
  market: NflModelReport;
  importance: Array<{ name: string; splits: number; share: number }>;
} {
  const logregPairs = predictNflFold(rows, fit, "logreg");
  const gbtPairs = predictNflFold(rows, fit, "gbt");
  const marketPairs: ProbPair[] = rows.map((row) => {
    const b = marketBaseline(row.market, row.predictionAt);
    return { p: b?.noVigHome ?? 0.5, y: row.y };
  });
  return {
    logreg: reportNflCandidate(rows, logregPairs, "logreg"),
    gbt: reportNflCandidate(rows, gbtPairs, "gbt"),
    market: reportNflCandidate(rows, marketPairs, "market"),
    importance: gbtFeatureImportance(fit.gbt, [...NFL_VECTOR_KEYS]),
  };
}
