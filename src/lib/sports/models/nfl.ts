import { clamp } from "../odds.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest, sitePct, spreadPlay, totalPlay } from "./common.ts";
import { injuryDelta, injuryNotes } from "./injury.ts";
import { windUnderLean } from "./weather.ts";

export function rankNfl(game: GameCard): RankPick | null {
  if (!gate(game)) return null;
  const splits = sitePct(game);
  if (splits.home == null || splits.away == null) return null;
  let p = clamp(0.5 + (splits.home - splits.away) * 0.34 + 0.028, 0.22, 0.78);
  p = clamp(p + injuryDelta(game, "nfl"), 0.18, 0.82);
  const wx = windUnderLean(game.weather);
  const qb = [...injuryNotes(game, "home"), ...injuryNotes(game, "away")];
  const why = `${game.home.abbr} home split ${game.home.homeSplit ?? game.home.record} vs ${game.away.abbr} road ${game.away.roadSplit ?? game.away.record}.${qb.length ? ` ${qb.join(", ")}.` : ""}${wx.note}`;

  const cands: RankPick[] = [];
  const spread = spreadPlay(game, p, 26, 7.5, why, "v2-nfl");
  if (spread) cands.push(spread);
  const ml = mlPlay(game, p, why, "v2-nfl", { maxChalk: 240, maxDog: 150 });
  if (ml) cands.push(ml);
  if (game.odds.total != null) {
    let modelOver = 0.5;
    if (game.odds.total < 41) modelOver = 0.54;
    if (game.odds.total > 48) modelOver = 0.46;
    modelOver = clamp(modelOver - wx.under, 0.4, 0.6);
    const tot = totalPlay(game, modelOver, `NFL total ${game.odds.total}.${wx.note}`, "v2-nfl");
    if (tot) cands.push(tot);
  }
  return pickBest(game, cands, "spread");
}
