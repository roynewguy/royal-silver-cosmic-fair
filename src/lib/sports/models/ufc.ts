import { clamp, parseWinPct } from "../odds.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest } from "./common.ts";

export function rankUfc(game: GameCard): RankPick | null {
  if (!gate(game)) return null;
  const hw = parseWinPct(game.home.record);
  const aw = parseWinPct(game.away.record);
  if (hw == null || aw == null) return null;
  const p = clamp(0.5 + (hw - aw) * 0.42, 0.28, 0.72);
  const why = `${game.home.abbr} ${game.home.record} vs ${game.away.abbr} ${game.away.record} (UFC ML only).`;
  const ml = mlPlay(game, p, why, "v2-ufc", { maxChalk: 280, maxDog: 180 });
  return ml ? pickBest(game, [ml], "moneyline") : null;
}
