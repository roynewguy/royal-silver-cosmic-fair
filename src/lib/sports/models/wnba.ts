import { clamp } from "../odds.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest, sitePct, spreadPlay, totalPlay } from "./common.ts";
import { injuryDelta, injuryNotes } from "./injury.ts";

export function rankWnba(game: GameCard): RankPick | null {
  if (!gate(game)) return null;
  const splits = sitePct(game);
  if (splits.home == null || splits.away == null) return null;
  let p = clamp(0.5 + (splits.home - splits.away) * 0.44 + 0.02, 0.2, 0.8);
  p = clamp(p + injuryDelta(game, "wnba"), 0.2, 0.8);
  const outs = [...injuryNotes(game, "home"), ...injuryNotes(game, "away")];
  const why = `${game.home.abbr} WNBA home split ${game.home.homeSplit ?? game.home.record} vs ${game.away.abbr} road ${game.away.roadSplit ?? game.away.record}.${outs.length ? ` ${outs.join(", ")}` : ""}`;
  const cands: RankPick[] = [];
  const spread = spreadPlay(game, p, 14, 12.5, why, "v2-wnba");
  if (spread) cands.push(spread);
  const ml = mlPlay(game, p, why, "v2-wnba", { maxChalk: 260, maxDog: 165 });
  if (ml) cands.push(ml);
  if (game.odds.total != null) {
    const modelOver = game.odds.total < 158 ? 0.54 : game.odds.total > 172 ? 0.46 : 0.5;
    const tot = totalPlay(game, modelOver, `WNBA total ${game.odds.total}.`, "v2-wnba");
    if (tot) cands.push(tot);
  }
  return pickBest(game, cands, "spread");
}
