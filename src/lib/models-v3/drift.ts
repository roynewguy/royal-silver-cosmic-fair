import { brier } from "./evaluate.ts";
import type { ModelDrift } from "../sports/types.ts";

export type DriftRow = { p: number; y: number };

export type WindowStats = {
  n: number;
  roi: number | null;
  brier: number | null;
};

export function windowStats(rows: DriftRow[], n: number): WindowStats {
  const slice = rows.slice(0, n);
  if (!slice.length) return { n: 0, roi: null, brier: null };
  let units = 0;
  for (const r of slice) units += r.y === 1 ? 0.91 : -1;
  return {
    n: slice.length,
    roi: units / slice.length,
    brier: brier(slice.map((r) => ({ p: r.p, y: r.y, stakePrice: null, closePrice: null }))),
  };
}

/** Flag deterioration. Never auto-retrain or auto-promote. */
export function driftReport(rows: DriftRow[]): ModelDrift {
  const last50 = windowStats(rows, 50);
  const last100 = windowStats(rows, 100);
  const last250 = windowStats(rows, 250);
  let flag = false;
  let note: string | null = null;
  if (last50.n >= 30 && last250.n >= 80) {
    if (last50.roi != null && last250.roi != null && last50.roi < -0.08 && last50.roi < last250.roi - 0.08) {
      flag = true;
      note = "Recent ROI is deteriorating versus the longer window. Do not auto-retrain.";
    }
    if (last50.brier != null && last250.brier != null && last50.brier > last250.brier + 0.03) {
      flag = true;
      note = note ? `${note} Recent Brier is also worse.` : "Recent Brier is worse than the longer window. Do not auto-retrain.";
    }
  }
  return {
    last50Roi: last50.roi,
    last100Roi: last100.roi,
    last250Roi: last250.roi,
    last50Brier: last50.brier,
    last100Brier: last100.brier,
    last250Brier: last250.brier,
    flag,
    note,
  };
}
