import type { Injury } from "../../../../sports/types.ts";
import { injuryStatusWeight } from "../../../../sports/player-impact.ts";

/**
 * NFL positional / value weighting for the challenger.
 * Does not modify V2 injuryDelta. Missing position → unknown group, lower confidence.
 * Do not treat every injury equally.
 */
export const NFL_INJURY_GROUPS = ["qb", "ol", "wr", "te", "rb", "dl", "lb", "db", "other"] as const;
export type NflInjuryGroup = (typeof NFL_INJURY_GROUPS)[number];

/** Relative value. QB >> skill >> OL/front seven. Not a PFF grade. */
export const NFL_GROUP_WEIGHT: Record<NflInjuryGroup, number> = {
  qb: 1,
  ol: 0.28,
  wr: 0.26,
  te: 0.16,
  rb: 0.24,
  dl: 0.2,
  lb: 0.16,
  db: 0.18,
  other: 0.08,
};

export function nflInjuryGroup(position: string | null | undefined): NflInjuryGroup {
  const p = (position ?? "").toUpperCase().trim();
  if (!p) return "other";
  if (p === "QB") return "qb";
  if (p === "LT" || p === "RT" || p === "T" || p === "OT" || p === "G" || p === "OG" || p === "C" || p === "OL") return "ol";
  if (p === "WR") return "wr";
  if (p === "TE") return "te";
  if (p === "RB" || p === "FB" || p === "HB") return "rb";
  if (p === "DE" || p === "DT" || p === "NT" || p === "DL" || p === "EDGE") return "dl";
  if (p === "LB" || p === "ILB" || p === "OLB" || p === "MLB") return "lb";
  if (p === "CB" || p === "S" || p === "FS" || p === "SS" || p === "DB" || p === "SAF") return "db";
  return "other";
}

export type NflInjuryWeights = {
  home: number;
  away: number;
  deltaAwayMinusHome: number;
  qbOutHome: number;
  qbOutAway: number;
  qbDoubtHome: number;
  qbDoubtAway: number;
  byGroupHome: Record<NflInjuryGroup, number>;
  byGroupAway: Record<NflInjuryGroup, number>;
  unknownPositionShare: number;
};

function emptyGroups(): Record<NflInjuryGroup, number> {
  return { qb: 0, ol: 0, wr: 0, te: 0, rb: 0, dl: 0, lb: 0, db: 0, other: 0 };
}

export function nflInjuryWeights(injuries: Injury[]): NflInjuryWeights {
  const byGroupHome = emptyGroups();
  const byGroupAway = emptyGroups();
  let unknown = 0;
  let qbOutHome = 0;
  let qbOutAway = 0;
  let qbDoubtHome = 0;
  let qbDoubtAway = 0;
  for (const row of injuries) {
    const group = nflInjuryGroup(row.position);
    if (!row.position?.trim()) unknown += 1;
    const w = injuryStatusWeight(row.status) * NFL_GROUP_WEIGHT[group];
    if (row.team === "home") byGroupHome[group] += w;
    else byGroupAway[group] += w;
    if (group === "qb") {
      if (row.status === "out") {
        if (row.team === "home") qbOutHome = 1;
        else qbOutAway = 1;
      } else if (row.status === "doubtful" || row.status === "questionable") {
        if (row.team === "home") qbDoubtHome = 1;
        else qbDoubtAway = 1;
      }
    }
  }
  const sum = (g: Record<NflInjuryGroup, number>) => NFL_INJURY_GROUPS.reduce((s, k) => s + g[k], 0);
  const home = sum(byGroupHome);
  const away = sum(byGroupAway);
  return {
    home,
    away,
    deltaAwayMinusHome: away - home,
    qbOutHome,
    qbOutAway,
    qbDoubtHome,
    qbDoubtAway,
    byGroupHome,
    byGroupAway,
    unknownPositionShare: injuries.length ? unknown / injuries.length : 0,
  };
}

export function nflQbUnconfirmed(w: NflInjuryWeights, boardPresent: boolean): boolean {
  if (!boardPresent) return true;
  return w.qbOutHome + w.qbOutAway + w.qbDoubtHome + w.qbDoubtAway > 0;
}
