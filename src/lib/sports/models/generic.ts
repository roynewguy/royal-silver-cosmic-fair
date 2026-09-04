import { clamp, parseWinPct } from "../odds.ts";
import type { LeagueConfig } from "../leagues.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest, spreadPlay, totalPlay } from "./common.ts";
import { injuryDelta } from "./injury.ts";

export function rankGeneric(game: GameCard, league: LeagueConfig): RankPick | null {
  if (!gate(game)) return null;
  const hw = parseWinPct(game.home.record);
  const aw = parseWinPct(game.away.record);
  if (hw == null || aw == null) return null;
  const p = clamp(0.5 + (hw - aw) * 0.38 + league.homeAdv + injuryDelta(game, league.id), 0.2, 0.8);
  const why = `${game.home.abbr} ${game.home.record} vs ${game.away.abbr} ${game.away.record} (generic ${league.id}).`;
  const cands: RankPick[] = [];
  if (league.kind === "spread") {
    const spread = spreadPlay(game, p, league.ptsPerWin, league.id === "ncaaf" ? 16.5 : 14.5, why, `v2-${league.id}`);
    if (spread) cands.push(spread);
  }
  const ml = mlPlay(game, p, why, `v2-${league.id}`, {
    maxChalk: league.kind === "moneyline" ? 260 : 320,
    maxDog: 170,
  });
  if (ml) cands.push(ml);
  if (league.avgTotal != null && game.odds.total != null) {
    let modelOver = 0.5;
    if (game.odds.total < league.avgTotal - 1.5) modelOver = 0.54;
    if (game.odds.total > league.avgTotal + 1.5) modelOver = 0.46;
    const tot = totalPlay(game, modelOver, `${league.sport} total vs baseline ${league.avgTotal}.`, `v2-${league.id}`);
    if (tot) cands.push(tot);
  }
  return pickBest(cands, league.kind === "spread" ? "spread" : "moneyline");
}
