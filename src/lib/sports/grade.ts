import { profitFromOdds } from "../utils.ts";
import { LEAGUE_BY_ID } from "./leagues.ts";
import type { GameCard, GradeOutcome, PickResult, PickRow } from "./types.ts";

const DEAD = new Set(["postponed", "cancelled", "suspended"]);

export type GradeSnapshot = {
  frozenAt: string;
  gameId: string;
  league: string;
  homeName: string;
  awayName: string;
  startAt: string;
  market: string;
  selection: string;
  side: string;
  homeScore: number | null;
  awayScore: number | null;
  gameStatus: string;
  outcome: GradeOutcome;
  ledgerResult: PickResult | null;
  source: "espn-final";
};

export function ledgerResult(outcome: GradeOutcome): PickResult | null {
  if (outcome === "UNRESOLVED") return null;
  if (outcome === "POSTPONED" || outcome === "CANCELLED") return "VOID";
  return outcome;
}

export function gradeOutcome(pick: PickRow, game: GameCard): GradeOutcome {
  if (pick.gameId !== game.id || pick.league !== game.league) return "UNRESOLVED";
  if (game.status === "postponed") return "POSTPONED";
  if (game.status === "cancelled") return "CANCELLED";
  if (game.status !== "final") return "UNRESOLVED";
  const result = gradePick(pick, game);
  return result ?? "UNRESOLVED";
}

export function buildGradeSnapshot(pick: PickRow, game: GameCard, outcome: GradeOutcome, frozenAt = new Date().toISOString()): GradeSnapshot {
  return {
    frozenAt,
    gameId: game.id,
    league: game.league,
    homeName: game.home.name,
    awayName: game.away.name,
    startAt: game.startAt,
    market: pick.market,
    selection: pick.selection,
    side: pick.side,
    homeScore: game.home.score,
    awayScore: game.away.score,
    gameStatus: game.status,
    outcome,
    ledgerResult: ledgerResult(outcome),
    source: "espn-final",
  };
}

export function gradePick(pick: PickRow, game: GameCard): PickResult | null {
  if (DEAD.has(game.status)) return null;
  if (pick.gameId !== game.id || pick.league !== game.league || pick.needsManualGrade) return null;
  if (game.status !== "final") return null;
  const hs = game.home.score;
  const as = game.away.score;
  if (hs == null || as == null || !Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0) return null;

  const league = LEAGUE_BY_ID[pick.league as keyof typeof LEAGUE_BY_ID];
  const soccer = league?.soccer3way === true;

  if (pick.market === "moneyline") {
    if (hs === as) return soccer ? "LOSS" : "PUSH";
    const homeWon = hs > as;
    const tookHome = pick.side === "home";
    return homeWon === tookHome ? "WIN" : "LOSS";
  }

  if (pick.market === "total") {
    const total = hs + as;
    const line = pick.lockedLine;
    if (line == null) return null;
    if (total === line) return "PUSH";
    const wentOver = total > line;
    return (pick.side === "over") === wentOver ? "WIN" : "LOSS";
  }

  const line = pick.lockedLine;
  if (line == null) return null;
  const margin = pick.side === "home" ? hs + line - as : as + line - hs;
  if (margin === 0) return "PUSH";
  return margin > 0 ? "WIN" : "LOSS";
}

export function settle(pick: PickRow, result: PickResult): { profit: number } {
  return { profit: profitFromOdds(pick.lockedOdds, pick.units, result) };
}
