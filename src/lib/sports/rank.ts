import { isOfficialDay } from "./day.ts";
import { isFreeBetaMode } from "./free-beta.ts";
import { LEAGUE_BY_ID } from "./leagues.ts";
import { hasUsableOdds } from "./odds.ts";
import { isDraftKingsLine } from "./odds-api.ts";
import { rankGeneric } from "./models/generic.ts";
import { rankMlb } from "./models/mlb.ts";
import { rankNba } from "./models/nba.ts";
import { rankNcaaf } from "./models/ncaaf.ts";
import { rankNfl } from "./models/nfl.ts";
import { rankNhl } from "./models/nhl.ts";
import { rankUfc } from "./models/ufc.ts";
import { rankWnba } from "./models/wnba.ts";
import type { GameCard, RankPick, SportScan } from "./types.ts";

export function rankGame(game: GameCard): RankPick | null {
  const league = LEAGUE_BY_ID[game.league];
  if (!league?.official) return null;
  switch (league.id) {
    case "nba":
      return rankNba(game);
    case "mlb":
      return rankMlb(game);
    case "nfl":
      return rankNfl(game);
    case "nhl":
      return rankNhl(game);
    case "ncaaf":
      return rankNcaaf(game);
    case "wnba":
      return rankWnba(game);
    case "ufc":
      return rankUfc(game);
    default:
      return rankGeneric(game, league);
  }
}

export function rankGames(games: GameCard[]): GameCard[] {
  return games.map((game) => ({ ...game, rank: rankGame(game) }));
}

export function bestPerSport(
  games: GameCard[],
  minEdge = 3,
  minConf = 58,
  now = new Date(),
): { pick: GameCard; skip: SportScan }[] {
  const bySport = new Map<string, GameCard[]>();
  for (const g of games) {
    const list = bySport.get(g.league) ?? [];
    list.push(g);
    bySport.set(g.league, list);
  }
  const out: { pick: GameCard; skip: SportScan }[] = [];
  for (const league of Object.values(LEAGUE_BY_ID)) {
    const all = bySport.get(league.id) ?? [];
    if (!league.official) {
      out.push({
        pick: all[0] ?? ({ league: league.id, sport: league.sport } as GameCard),
        skip: {
          league: league.id,
          sport: league.sport,
          active: false,
          gameCount: all.length,
          skipped: true,
          skipReason: "Soccer desk dark until 3-way markets ship.",
        },
      });
      continue;
    }
    const slate = all.filter((g) => g.status === "scheduled" && isOfficialDay(g.startAt, now));
    const playable = slate.filter(
      (g) => g.rank && g.rank.edgePct >= minEdge && g.rank.confidence >= minConf,
    );
    playable.sort((a, b) => (b.rank?.edgePct ?? 0) - (a.rank?.edgePct ?? 0));
    const top = playable[0];
    if (!top) {
      out.push({
        pick: slate[0] ?? ({ league: league.id, sport: league.sport } as GameCard),
        skip: {
          league: league.id,
          sport: league.sport,
          active: slate.length > 0,
          gameCount: slate.length,
          skipped: true,
          skipReason:
            slate.length === 0
              ? "No games on today's PT card."
              : !isFreeBetaMode() && slate.every((g) => !isDraftKingsLine(g.odds))
                ? "PASS: DraftKings line unavailable."
                : slate.every((g) => !hasUsableOdds(g.odds))
                  ? "No listed odds — pass."
                  : "No play meets the edge threshold.",
        },
      });
    } else {
      out.push({
        pick: top,
        skip: {
          league: league.id,
          sport: league.sport,
          active: true,
          gameCount: slate.length,
          skipped: false,
          skipReason: null,
        },
      });
    }
  }
  return out;
}

export function unitsFor(confidence: number): number {
  if (confidence >= 80) return 2;
  if (confidence >= 72) return 1.5;
  return 1;
}

export function clampDailyPicks(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(8, Math.max(1, Math.round(n)));
}

export function takeTopPlays<T extends { skip: { skipped: boolean }; pick: { rank?: { edgePct: number } | null } }>(
  decisions: T[],
  maxPicks = 3,
): { take: T[]; rest: T[] } {
  const cap = clampDailyPicks(maxPicks);
  const playable = decisions
    .filter((d) => !d.skip.skipped && d.pick.rank)
    .sort((a, b) => (b.pick.rank?.edgePct ?? 0) - (a.pick.rank?.edgePct ?? 0));
  return { take: playable.slice(0, cap), rest: playable.slice(cap) };
}
