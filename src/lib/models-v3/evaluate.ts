import { devig, impliedFromAmerican } from "../sports/odds.ts";
import { clampProb } from "./logreg.ts";

export type EvalRow = {
  p: number;
  y: number;
  stakePrice: number | null;
  closePrice: number | null;
};

export function brier(rows: EvalRow[]): number {
  if (!rows.length) return 1;
  return rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / rows.length;
}

export function logLoss(rows: EvalRow[]): number {
  if (!rows.length) return 99;
  return (
    rows.reduce((s, r) => {
      const p = clampProb(r.p);
      return s + (r.y ? -Math.log(p) : -Math.log(1 - p));
    }, 0) / rows.length
  );
}

export function accuracy(rows: EvalRow[]): number {
  if (!rows.length) return 0;
  return rows.filter((r) => (r.p >= 0.5 ? 1 : 0) === r.y).length / rows.length;
}

export function calibrationBuckets(rows: EvalRow[]): Array<{ key: string; n: number; predicted: number; actual: number | null }> {
  const defs = [
    { key: "50-55", lo: 0.5, hi: 0.55 },
    { key: "55-60", lo: 0.55, hi: 0.6 },
    { key: "60-65", lo: 0.6, hi: 0.65 },
    { key: "65-70", lo: 0.65, hi: 0.7 },
    { key: "70+", lo: 0.7, hi: 1.01 },
  ];
  return defs.map((b) => {
    const hit = rows.filter((r) => {
      const p = r.p >= 0.5 ? r.p : 1 - r.p;
      return p >= b.lo && p < b.hi;
    });
    const actual = hit.length ? hit.filter((r) => (r.p >= 0.5 ? r.y === 1 : r.y === 0)).length / hit.length : null;
    const predicted = hit.length ? hit.reduce((s, r) => s + Math.max(r.p, 1 - r.p), 0) / hit.length : 0;
    return { key: b.key, n: hit.length, predicted, actual };
  });
}

function profit(american: number, won: boolean): number {
  if (!won) return -1;
  if (american < 0) return 100 / Math.abs(american);
  return american / 100;
}

export function backtest(rows: EvalRow[], minEdge: number): { n: number; units: number; roi: number | null; avgClv: number | null } {
  let n = 0;
  let units = 0;
  const clvs: number[] = [];
  for (const r of rows) {
    if (r.stakePrice == null) continue;
    const market = impliedFromAmerican(r.stakePrice);
    const sideHome = r.p >= market;
    const edge = sideHome ? r.p - market : 1 - r.p - (1 - market);
    if (edge < minEdge) continue;
    const price = sideHome ? r.stakePrice : r.stakePrice; // home price if betting home; need away price
    n += 1;
    const won = sideHome ? r.y === 1 : r.y === 0;
    units += profit(price, won);
    if (r.closePrice != null) {
      const closeImp = impliedFromAmerican(r.closePrice);
      clvs.push(sideHome ? closeImp - market : (1 - closeImp) - (1 - market));
    }
  }
  return {
    n,
    units,
    roi: n ? units / n : null,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
  };
}

export type SideEval = EvalRow & {
  homePrice: number | null;
  awayPrice: number | null;
  closeHome: number | null;
  closeAway: number | null;
  homeOpen?: number | null;
  awayOpen?: number | null;
};

export function backtestSides(rows: SideEval[], minEdge: number): { n: number; units: number; roi: number | null; avgClv: number | null } {
  let n = 0;
  let units = 0;
  const clvs: number[] = [];
  for (const r of rows) {
    if (r.homePrice == null || r.awayPrice == null) continue;
    const mHome = impliedFromAmerican(r.homePrice);
    const mAway = impliedFromAmerican(r.awayPrice);
    const edgeHome = r.p - mHome;
    const edgeAway = 1 - r.p - mAway;
    const betHome = edgeHome >= edgeAway;
    const edge = betHome ? edgeHome : edgeAway;
    if (edge < minEdge) continue;
    const price = betHome ? r.homePrice : r.awayPrice;
    const won = betHome ? r.y === 1 : r.y === 0;
    n += 1;
    units += profit(price, won);
    const close = betHome ? r.closeHome : r.closeAway;
    if (close != null) {
      const openImp = impliedFromAmerican(price);
      clvs.push(impliedFromAmerican(close) - openImp);
    }
  }
  return { n, units, roi: n ? units / n : null, avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null };
}

/** Requires both opening moneylines and de-vigs. Never stakes the closer. */
export function honestBacktest(rows: SideEval[], minEdge: number): { n: number; units: number; roi: number | null; avgClv: number | null } {
  let n = 0;
  let units = 0;
  const clvs: number[] = [];
  for (const r of rows) {
    const homeOpen = r.homeOpen ?? null;
    const awayOpen = r.awayOpen ?? null;
    if (homeOpen == null || awayOpen == null) continue;
    const [fairHome] = devig(homeOpen, awayOpen);
    const edgeHome = r.p - fairHome;
    const edgeAway = 1 - r.p - (1 - fairHome);
    const betHome = edgeHome >= edgeAway;
    const edge = betHome ? edgeHome : edgeAway;
    if (edge < minEdge) continue;
    const price = betHome ? homeOpen : awayOpen;
    const won = betHome ? r.y === 1 : r.y === 0;
    n += 1;
    units += profit(price, won);
    const close = betHome ? r.closeHome : r.closeAway;
    if (close != null) clvs.push(impliedFromAmerican(close) - impliedFromAmerican(price));
  }
  return { n, units, roi: n ? units / n : null, avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null };
}

