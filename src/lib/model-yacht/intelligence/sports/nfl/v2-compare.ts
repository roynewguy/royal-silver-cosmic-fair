import { clamp } from "../../../../sports/odds.ts";
import { sitePct } from "../../../../sports/models/common.ts";
import { injuryDelta } from "../../../../sports/models/injury.ts";
import { rankNfl } from "../../../../sports/models/nfl.ts";
import type { GameCard } from "../../../../sports/types.ts";

/**
 * Reconstructs V2 NFL home-win probability using the live champion formula.
 * Does not modify v2-nfl. Used only for head-to-head research comparison.
 */
export function v2NflHomeProbability(game: GameCard): number | null {
  const splits = sitePct(game);
  if (splits.home == null || splits.away == null) return null;
  let p = clamp(0.5 + (splits.home - splits.away) * 0.34 + 0.028, 0.22, 0.78);
  p = clamp(p + injuryDelta(game, "nfl"), 0.18, 0.82);
  return p;
}

export function v2NflStillChampionTag(game: GameCard): string | null {
  return rankNfl(game)?.model ?? null;
}
