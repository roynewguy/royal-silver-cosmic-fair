import { clamp, impliedFromAmerican, parseWinPct } from "../sports/odds.ts";
import { weightedInjuryImpact } from "../sports/player-impact.ts";
import type { GameCard } from "../sports/types.ts";

/**
 * Shadow-only MLB feature bag for V4.
 * Uses only pregame fields on the card. Never scores, never closing lines.
 * Unavailable research stats (FIP/xFIP/K-BB%/wRC+/handedness/bullpen workload)
 * are listed as missing and increase uncertainty — they are not invented.
 */
export type MlbShadowFeatures = {
  eraHome: number | null;
  eraAway: number | null;
  whipHome: number | null;
  whipAway: number | null;
  restHint: number | null;
  park: string | null;
  weather: string | null;
  openHomeMl: number | null;
  currentHomeMl: number | null;
  lineMoveProb: number | null;
  homeWinPct: number | null;
  awayWinPct: number | null;
  injuryAwayMinusHome: number;
  missing: string[];
  /** Extra uncertainty 0–1 when research features are absent. */
  uncertaintyBump: number;
};

const RESEARCH_GAPS = [
  "fip",
  "xfip",
  "k_bb_pct",
  "wrc_plus",
  "handedness_splits",
  "bullpen_workload",
  "lineup_strength",
] as const;

export function mlbShadowFeatures(game: GameCard): MlbShadowFeatures {
  const missing: string[] = [...RESEARCH_GAPS];
  const hs = game.home.starter;
  const as_ = game.away.starter;
  const eraHome = hs?.era ?? null;
  const eraAway = as_?.era ?? null;
  const whipHome = hs?.whip ?? null;
  const whipAway = as_?.whip ?? null;
  if (eraHome == null || eraAway == null) missing.push("starter_era");
  if (whipHome == null || whipAway == null) missing.push("starter_whip");
  if (!hs?.name || !as_?.name) missing.push("starter_identity");
  if (!game.weather) missing.push("weather");
  if (!game.venue) missing.push("park");
  if (game.odds.openHomeMl == null) missing.push("opening_market");
  if (game.odds.homeMl == null || game.odds.awayMl == null) missing.push("current_two_way_market");

  const homeWinPct = parseWinPct(game.home.record);
  const awayWinPct = parseWinPct(game.away.record);
  if (homeWinPct == null || awayWinPct == null) missing.push("team_records");

  let lineMoveProb: number | null = null;
  if (game.odds.openHomeMl != null && game.odds.homeMl != null) {
    lineMoveProb = impliedFromAmerican(game.odds.homeMl) - impliedFromAmerican(game.odds.openHomeMl);
  }

  const inj = weightedInjuryImpact(game);
  const researchGap = 0.04;
  const fieldGap = clamp((missing.length - RESEARCH_GAPS.length) / 10, 0, 0.35);
  const uncertaintyBump = clamp(0.08 + researchGap + fieldGap + inj.missingValue, 0.08, 0.7);

  return {
    eraHome,
    eraAway,
    whipHome,
    whipAway,
    restHint: null,
    park: game.venue,
    weather: game.weather,
    openHomeMl: game.odds.openHomeMl,
    currentHomeMl: game.odds.homeMl,
    lineMoveProb,
    homeWinPct,
    awayWinPct,
    injuryAwayMinusHome: inj.away - inj.home,
    missing,
    uncertaintyBump,
  };
}
