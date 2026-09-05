import { inWindow } from "./espn.ts";
import { LEAGUE_BY_ID } from "./leagues.ts";
import { rankGames } from "./rank.ts";
import type { GameCard } from "./types.ts";

export function inLookahead(game: GameCard, now = Date.now()): boolean {
  const days = LEAGUE_BY_ID[game.league]?.lookAheadDays ?? 3;
  return inWindow(game, days, now);
}

/** Keep last-known games for leagues ESPN missed this tick so the daily card does not collapse. */
export function mergeFetchedSlate(ranked: GameCard[], previous: GameCard[], now = Date.now()): GameCard[] {
  const fetchedLeagues = new Set(ranked.map((g) => g.league));
  const kept = previous.filter((g) => !fetchedLeagues.has(g.league) && inLookahead(g, now));
  if (!kept.length) return ranked;
  return rankGames([...ranked, ...kept]);
}
