import { clamp } from "../odds.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest, sitePct, spreadPlay, totalPlay } from "./common.ts";
import { injuryDelta, injuryNotes } from "./injury.ts";
import { windUnderLean } from "./weather.ts";

export function rankNcaaf(game: GameCard): RankPick | null {
  if (!gate(game)) return null;
  const splits = sitePct(game);
  if (splits.home == null || splits.away == null) return null;
  let p = clamp(0.5 + (splits.home - splits.away) * 0.32 + 0.04, 0.2, 0.8);
  p = clamp(p + injuryDelta(game, "ncaaf"), 0.18, 0.82);
  const wx = windUnderLean(game.weather);
  const outs = [...injuryNotes(game, "home"), ...injuryNotes(game, "away")];
  const why = `${game.home.abbr} home-field NCAAF vs ${game.away.abbr}.${outs.length ? ` ${outs.join(", ")}.` : ""}${wx.note}`;
  const cands: RankPick[] = [];
  const spread = spreadPlay(game, p, 32, 16.5, why, "v2-ncaaf");
  if (spread) cands.push(spread);
  const ml = mlPlay(game, p, why, "v2-ncaaf", { maxChalk: 260, maxDog: 170 });
  if (ml) cands.push(ml);
  if (game.odds.total != null) {
    let modelOver = game.odds.total < 48 ? 0.53 : game.odds.total > 58 ? 0.47 : 0.5;
    modelOver = clamp(modelOver - wx.under, 0.4, 0.6);
    const tot = totalPlay(game, modelOver, `NCAAF total ${game.odds.total}.${wx.note}`, "v2-ncaaf");
    if (tot) cands.push(tot);
  }
  return pickBest(cands, "spread", 2);
}
