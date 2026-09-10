/**
 * MLS and EPL are three-way markets. They stay BLOCKED until a validated
 * 1X2 model exists. Do not hack them into two-way win probability.
 */

export const SOCCER_SPORTS = ["mls", "epl"] as const;
export type SoccerSport = (typeof SOCCER_SPORTS)[number];

export type ThreeWayOutcome = "home" | "draw" | "away";

export type ThreeWayProb = {
  home: number;
  draw: number;
  away: number;
};

export type ThreeWayMarket = {
  home: number;
  draw: number;
  away: number;
};

export function isSoccerSport(id: string): id is SoccerSport {
  return (SOCCER_SPORTS as readonly string[]).includes(id);
}

export function soccerLifecycle(): "BLOCKED" {
  return "BLOCKED";
}

export function soccerBlockedReason(sport: string): string {
  return `${sport.toUpperCase()} is a three-way (1X2) market. Two-way Yacht engines cannot post or shadow it until a validated HOME/DRAW/AWAY model exists.`;
}

export function normalizeThreeWay(p: ThreeWayProb): ThreeWayProb {
  const s = p.home + p.draw + p.away;
  if (!(s > 0) || !Number.isFinite(s)) throw new Error("three-way probabilities must sum to a positive finite number");
  return { home: p.home / s, draw: p.draw / s, away: p.away / s };
}

function implied(american: number): number {
  if (american < 0) return -american / (-american + 100);
  return 100 / (american + 100);
}

/** De-vig 1X2 across all three outcomes. One missing side is not a market. */
export function threeWayNoVig(market: ThreeWayMarket): ThreeWayProb | null {
  if (market.home == null || market.draw == null || market.away == null) return null;
  const raw = { home: implied(market.home), draw: implied(market.draw), away: implied(market.away) };
  const s = raw.home + raw.draw + raw.away;
  if (!(s > 0)) return null;
  return { home: raw.home / s, draw: raw.draw / s, away: raw.away / s };
}

/** Forbidden. Soccer cannot be collapsed to two-way home/away. */
export function twoWayFromSoccer(): never {
  throw new Error("MLS/EPL cannot be hacked into two-way win probability");
}

export type PoissonRates = { home: number; away: number };

function poissonPmf(l: number, k: number): number {
  if (l <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i += 1) p *= l / i;
  return p;
}

/**
 * Independent Poisson goals → 1X2. Rates must be supplied from a dated source.
 * Do not invent lambda from win percentage.
 */
export function poissonThreeWay(rates: PoissonRates, maxGoals = 10): ThreeWayProb {
  if (!(rates.home > 0) || !(rates.away > 0)) throw new Error("Poisson rates must be proven positive; do not invent them");
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i <= maxGoals; i += 1) {
    for (let j = 0; j <= maxGoals; j += 1) {
      const p = poissonPmf(rates.home, i) * poissonPmf(rates.away, j);
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  return normalizeThreeWay({ home, draw, away });
}

/**
 * Dixon-Coles down-weights low-score dependence. tau must come from a fitted
 * model — this function does not invent tau.
 */
export function dixonColesAdjust(
  rates: PoissonRates,
  tau: number,
  maxGoals = 10,
): ThreeWayProb {
  if (!Number.isFinite(tau)) throw new Error("Dixon-Coles tau is missing");
  function corr(i: number, j: number): number {
    if (i === 0 && j === 0) return 1 - rates.home * rates.away * tau;
    if (i === 0 && j === 1) return 1 + rates.home * tau;
    if (i === 1 && j === 0) return 1 + rates.away * tau;
    if (i === 1 && j === 1) return 1 - tau;
    return 1;
  }
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i <= maxGoals; i += 1) {
    for (let j = 0; j <= maxGoals; j += 1) {
      const p = poissonPmf(rates.home, i) * poissonPmf(rates.away, j) * corr(i, j);
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  return normalizeThreeWay({ home, draw, away });
}

export function soccerMayShadow(_sport: SoccerSport): false {
  return false;
}

export function soccerMayPostOfficial(_sport: SoccerSport): false {
  return false;
}
