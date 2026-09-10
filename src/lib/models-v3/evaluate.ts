import { impliedFromAmerican, twoWayMarket } from "../sports/odds.ts";
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

/**
 * Stake price for a historical bet. Closing is ignored on purpose.
 * Missing pre-prediction price → drop (null). Never invent, never fall back to close.
 */
export function pregameStakePrice(open: number | null | undefined, _close?: number | null | undefined): number | null {
  if (open == null || !Number.isFinite(open) || open === 0) return null;
  return open;
}

/** CLV on the selected side only. Missing close stays null — never 0. */
export function clvSelectedSide(stakePrice: number, closePrice: number | null | undefined): number | null {
  if (closePrice == null || !Number.isFinite(closePrice) || closePrice === 0) return null;
  return impliedFromAmerican(closePrice) - impliedFromAmerican(stakePrice);
}

export type SideEval = EvalRow & {
  homePrice: number | null;
  awayPrice: number | null;
  closeHome: number | null;
  closeAway: number | null;
  homeOpen?: number | null;
  awayOpen?: number | null;
};

export type MarketSides = {
  homeOpen: number | null;
  awayOpen: number | null;
  homeClose: number | null;
  awayClose: number | null;
};

/** Map a row onto eval fields. Close is never copied into stake/homePrice/awayPrice. */
export function sideEvalFromMarket(p: number, y: 0 | 1, market: MarketSides): SideEval {
  const home = pregameStakePrice(market.homeOpen, market.homeClose);
  const away = pregameStakePrice(market.awayOpen, market.awayClose);
  return {
    p,
    y,
    stakePrice: home,
    closePrice: market.homeClose,
    homePrice: home,
    awayPrice: away,
    closeHome: market.homeClose,
    closeAway: market.awayClose,
    homeOpen: market.homeOpen,
    awayOpen: market.awayOpen,
  };
}

function stakePair(r: SideEval): { home: number; away: number } | null {
  const home = pregameStakePrice(r.homeOpen ?? r.homePrice, r.closeHome);
  const away = pregameStakePrice(r.awayOpen ?? r.awayPrice, r.closeAway);
  if (home == null || away == null) return null;
  return { home, away };
}

/**
 * Two-sided ROI using each side's actual pregame price.
 * Does not de-vig (legacy V3 metric). Honest/Yacht ROI de-vigs.
 * Home bets stake home; away bets stake away. Missing either side → drop.
 */
export function backtestSides(rows: SideEval[], minEdge: number): { n: number; units: number; roi: number | null; avgClv: number | null } {
  let n = 0;
  let units = 0;
  const clvs: number[] = [];
  for (const r of rows) {
    const pair = stakePair(r);
    if (!pair) continue;
    const mHome = impliedFromAmerican(pair.home);
    const mAway = impliedFromAmerican(pair.away);
    const edgeHome = r.p - mHome;
    const edgeAway = 1 - r.p - mAway;
    const betHome = edgeHome >= edgeAway;
    const edge = betHome ? edgeHome : edgeAway;
    if (edge < minEdge) continue;
    const price = betHome ? pair.home : pair.away;
    const won = betHome ? r.y === 1 : r.y === 0;
    n += 1;
    units += profit(price, won);
    const close = betHome ? r.closeHome : r.closeAway;
    const clv = clvSelectedSide(price, close);
    if (clv != null) clvs.push(clv);
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
    const mkt = twoWayMarket(homeOpen, awayOpen);
    const edgeHome = r.p - mkt.noVigA;
    const edgeAway = 1 - r.p - mkt.noVigB;
    const betHome = edgeHome >= edgeAway;
    const edge = betHome ? edgeHome : edgeAway;
    if (edge < minEdge) continue;
    const price = betHome ? homeOpen : awayOpen;
    const won = betHome ? r.y === 1 : r.y === 0;
    n += 1;
    units += profit(price, won);
    const close = betHome ? r.closeHome : r.closeAway;
    const clv = clvSelectedSide(price, close);
    if (clv != null) clvs.push(clv);
  }
  return { n, units, roi: n ? units / n : null, avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null };
}
