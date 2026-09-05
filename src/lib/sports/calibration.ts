import type { CalibrationReport, CalibrationSlice, PickRow } from "./types.ts";

export const PROB_BUCKETS = ["55-59", "60-64", "65-69", "70+"] as const;
export type ProbBucket = (typeof PROB_BUCKETS)[number];

const MIN_SAMPLE = 30;

export function asPercent(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  return p <= 1.5 ? p * 100 : p;
}

export function probabilityBucket(p: number | null | undefined): ProbBucket | "other" {
  const pct = asPercent(p);
  if (pct == null) return "other";
  if (pct < 55) return "other";
  if (pct < 60) return "55-59";
  if (pct < 65) return "60-64";
  if (pct < 70) return "65-69";
  return "70+";
}

function emptySlice(key: string): CalibrationSlice {
  return {
    key,
    bets: 0,
    decided: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    voids: 0,
    actualWinRate: null,
    expectedWinRate: null,
    delta: null,
    roi: null,
    units: 0,
    avgClv: null,
    enough: false,
  };
}

function finish(slice: CalibrationSlice, expectedSum: number, clvSum: number, clvN: number, stake: number): CalibrationSlice {
  const decided = slice.wins + slice.losses;
  const actual = decided > 0 ? slice.wins / decided : null;
  const expected = decided > 0 ? expectedSum / decided : null;
  return {
    ...slice,
    decided,
    actualWinRate: actual,
    expectedWinRate: expected,
    delta: actual != null && expected != null ? actual - expected : null,
    roi: stake > 0 ? slice.units / stake : null,
    avgClv: clvN > 0 ? clvSum / clvN : null,
    enough: decided >= MIN_SAMPLE,
  };
}

function accumulate(picks: PickRow[], keyFn: (p: PickRow) => string | null): CalibrationSlice[] {
  const acc = new Map<string, { slice: CalibrationSlice; expectedSum: number; clvSum: number; clvN: number; stake: number }>();
  const take = (key: string) => {
    let row = acc.get(key);
    if (!row) {
      row = { slice: emptySlice(key), expectedSum: 0, clvSum: 0, clvN: 0, stake: 0 };
      acc.set(key, row);
    }
    return row;
  };
  for (const pick of picks) {
    if (pick.ledger === "paper") continue;
    if (pick.status !== "posted" && pick.status !== "graded") continue;
    const key = keyFn(pick);
    if (!key) continue;
    const row = take(key);
    row.slice.bets += 1;
    row.stake += pick.units || 0;
    if (pick.result === "WIN") row.slice.wins += 1;
    else if (pick.result === "LOSS") row.slice.losses += 1;
    else if (pick.result === "PUSH") row.slice.pushes += 1;
    else if (pick.result === "VOID") row.slice.voids += 1;
    if (pick.result === "WIN" || pick.result === "LOSS") {
      const p = asPercent(pick.modelProbability);
      if (p != null) row.expectedSum += p / 100;
    }
    if (pick.profitUnits != null) row.slice.units += pick.profitUnits;
    if (pick.clv != null) {
      row.clvSum += pick.clv;
      row.clvN += 1;
    }
  }
  return [...acc.values()].map((row) => finish(row.slice, row.expectedSum, row.clvSum, row.clvN, row.stake));
}

export function buildCalibration(picks: PickRow[]): CalibrationReport {
  const official = picks.filter((p) => p.status === "posted" || p.status === "graded");
  const bucketOrder = new Map(PROB_BUCKETS.map((k, i) => [k, i]));
  const buckets = accumulate(official, (p) => {
    const b = probabilityBucket(p.modelProbability);
    return b === "other" ? null : b;
  }).sort((a, b) => (bucketOrder.get(a.key as ProbBucket) ?? 9) - (bucketOrder.get(b.key as ProbBucket) ?? 9));
  for (const key of PROB_BUCKETS) {
    if (!buckets.some((b) => b.key === key)) buckets.push(emptySlice(key));
  }
  buckets.sort((a, b) => (bucketOrder.get(a.key as ProbBucket) ?? 9) - (bucketOrder.get(b.key as ProbBucket) ?? 9));
  const models = accumulate(official, (p) => p.modelVersion).sort((a, b) => a.key.localeCompare(b.key));
  const decided = official.filter((p) => p.result === "WIN" || p.result === "LOSS").length;
  return {
    buckets,
    models,
    official: official.length,
    decided,
    note:
      decided < MIN_SAMPLE
        ? `Need ${MIN_SAMPLE}+ decided tickets before trusting any bucket. Do not retune the model yet.`
        : "Buckets with under 30 decided bets are noise. Leave the formulas alone until a bucket is marked enough.",
  };
}
