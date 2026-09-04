import { profitFromOdds } from "@/lib/utils";
import type { GameCard, PickResult, PickRow } from "./types";

export function gradePick(pick: PickRow, game: GameCard): PickResult | null {
  if (game.status !== "final") return null;
  const hs = game.home.score;
  const as = game.away.score;
  if (hs == null || as == null) return null;

  if (pick.market === "moneyline") {
    if (hs === as) return "PUSH";
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
