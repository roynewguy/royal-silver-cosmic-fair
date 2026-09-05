import { clamp, parseWinPct } from "../odds.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest, sitePct, totalPlay } from "./common.ts";
import { injuryDelta, injuryNotes } from "./injury.ts";

export function rankNhl(game: GameCard): RankPick | null {
  if (!gate(game)) return null;
  const splits = sitePct(game);
  const hw = splits.home ?? parseWinPct(game.home.record);
  const aw = splits.away ?? parseWinPct(game.away.record);
  if (hw == null || aw == null) return null;
  let p = 0.5 + (hw - aw) * 0.4 + 0.042;
  const hg = game.home.starter?.savePct;
  const ag = game.away.starter?.savePct;
  if (hg != null && ag != null) p += clamp((hg - ag) * 0.8, -0.06, 0.06);
  p = clamp(p + injuryDelta(game, "nhl"), 0.22, 0.78);

  const goalies =
    game.home.starter || game.away.starter
      ? ` Goalies ${game.home.starter?.name ?? "TBD"} (${hg ?? "—"}) vs ${game.away.starter?.name ?? "TBD"} (${ag ?? "—"}).`
      : "";
  const outs = injuryNotes(game, "home").concat(injuryNotes(game, "away"));
  const why = `${game.home.abbr} home/road splits vs ${game.away.abbr}.${goalies}${outs.length ? ` ${outs.join(", ")}.` : ""}`;

  const cands: RankPick[] = [];
  const ml = mlPlay(game, p, why, "v2-nhl", { maxChalk: 220, maxDog: 160 });
  if (ml) cands.push(ml);
  if (game.odds.total != null) {
    let modelOver = 0.5;
    if (game.odds.total <= 5.5) modelOver = 0.54;
    if (game.odds.total >= 6.5) modelOver = 0.46;
    if (hg != null && ag != null && (hg + ag) / 2 >= 0.915) modelOver -= 0.03;
    const tot = totalPlay(game, modelOver, `NHL total ${game.odds.total}.${goalies}`, "v2-nhl");
    if (tot) cands.push(tot);
  }
  return pickBest(game, cands, "moneyline");
}
