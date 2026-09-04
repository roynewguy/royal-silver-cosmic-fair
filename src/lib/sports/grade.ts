import { profitFromOdds } from "../utils.ts";
import { LEAGUE_BY_ID } from "./leagues.ts";
import type { GameCard, PickResult, PickRow } from "./types.ts";

const DEAD = new Set(["postponed", "cancelled", "suspended"]);

export function gradePick(pick: PickRow, game: GameCard): PickResult | null {
  if (DEAD.has(game.status)) return "VOID";
  if (game.status !== "final") return null;
  const hs = game.home.score;
  const as = game.away.score;
  if (hs == null || as == null) return null;

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
    const line = pick.lockedLine ?? game.odds.total;
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
