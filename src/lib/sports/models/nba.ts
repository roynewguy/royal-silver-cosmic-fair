import { clamp } from "../odds.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest, sitePct, spreadPlay, totalPlay } from "./common.ts";
import { injuryDelta, injuryNotes } from "./injury.ts";

export function rankNba(game: GameCard): RankPick | null {
  if (!gate(game)) return null;
  const splits = sitePct(game);
  if (splits.home == null || splits.away == null) return null;
  // Home team's home split vs visitor's road split — not generic win%.
  let p = clamp(0.5 + (splits.home - splits.away) * 0.46 + 0.018, 0.2, 0.8);
  p = clamp(p + injuryDelta(game, "nba"), 0.2, 0.8);

  const outs = [
    ...injuryNotes(game, "home").map((s) => `HOME ${s}`),
    ...injuryNotes(game, "away").map((s) => `AWAY ${s}`),
  ];
  const splitWhy = `${game.home.abbr} home ${game.home.homeSplit ?? game.home.record} vs ${game.away.abbr} road ${game.away.roadSplit ?? game.away.record}`;
  const injWhy = outs.length ? ` · ${outs.join(", ")}` : "";

  const cands: RankPick[] = [];
  const spread = spreadPlay(
    game,
    p,
    18,
    14.5,
    `${splitWhy}. Projected margin vs the number.${injWhy}`,
    "v2-nba",
  );
  if (spread) cands.push(spread);
  const ml = mlPlay(game, p, `${splitWhy}.${injWhy}`, "v2-nba", { maxChalk: 280, maxDog: 170 });
  if (ml) cands.push(ml);
  if (game.odds.total != null) {
    let modelOver = 0.5;
    if (game.odds.total < 218) modelOver = 0.54;
    if (game.odds.total > 232) modelOver = 0.46;
    if (outs.length >= 3) modelOver -= 0.03;
    const tot = totalPlay(game, modelOver, `NBA scoring vs ${game.odds.total}.${injWhy}`, "v2-nba");
    if (tot) cands.push(tot);
  }
  return pickBest(cands, "spread", outs.length ? 1 : 3);
}
