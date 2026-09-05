import { clamp, parseWinPct } from "../odds.ts";
import type { GameCard, RankPick } from "../types.ts";
import { gate, mlPlay, pickBest, totalPlay } from "./common.ts";
import { injuryDelta, injuryNotes } from "./injury.ts";

export function rankMlb(game: GameCard): RankPick | null {
  if (!gate(game)) return null;
  const hw = parseWinPct(game.home.record);
  const aw = parseWinPct(game.away.record);
  if (hw == null || aw == null) return null;
  const hs = game.home.starter;
  const as_ = game.away.starter;
  let p = 0.5 + (hw - aw) * 0.16 + 0.038;
  if (hs?.era != null && as_?.era != null) {
    p += clamp((as_.era - hs.era) * 0.032, -0.09, 0.09);
  }
  p = clamp(p + injuryDelta(game, "mlb"), 0.22, 0.78);

  const arms =
    hs && as_
      ? `${hs.name} ERA ${hs.era ?? "—"} vs ${as_.name} ERA ${as_.era ?? "—"}`
      : "starter not confirmed";
  const bats = injuryNotes(game, "home").concat(injuryNotes(game, "away"));
  const why = `${arms}. Team W% secondary.${bats.length ? ` ${bats.join(", ")}` : ""}`;

  const cands: RankPick[] = [];
  const ml = mlPlay(game, p, why, "v2-mlb", { maxChalk: 180, maxDog: 165 });
  if (ml) cands.push(ml);
  if (game.odds.total != null && hs?.era != null && as_?.era != null) {
    const avgEra = (hs.era + as_.era) / 2;
    let modelOver = 0.5;
    if (avgEra >= 4.5 && game.odds.total <= 8) modelOver = 0.55;
    if (avgEra <= 3.2 && game.odds.total >= 8.5) modelOver = 0.45;
    const tot = totalPlay(
      game,
      modelOver,
      `Combined ERA ${avgEra.toFixed(2)} vs total ${game.odds.total}.`,
      "v2-mlb",
    );
    if (tot) cands.push(tot);
  }
  return pickBest(game, cands, "moneyline");
}
