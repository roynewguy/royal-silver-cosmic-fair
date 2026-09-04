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

export const MIN_DAILY_PICKS = 1;
export const MAX_DAILY_PICKS = 6;
export const DEFAULT_DAILY_PICKS = 3;

export function clampDailyPicks(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DAILY_PICKS;
  return Math.min(MAX_DAILY_PICKS, Math.max(MIN_DAILY_PICKS, Math.round(n)));
}

/** Env is the initial default only. Dashboard/DB is the live target. */
export function envDefaultDailyPicks(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DAILY_PICK_TARGET?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n)) return clampDailyPicks(n);
  }
  return DEFAULT_DAILY_PICKS;
}

export function resolveDailyPickTarget(input: {
  stored: number | null | undefined;
  source: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): number {
  if (input.source === "operator") return clampDailyPicks(Number(input.stored) || DEFAULT_DAILY_PICKS);
  return envDefaultDailyPicks(input.env);
}

/** Live daily cap from the desk setting (already resolved). Env does not override. */
export function dailyPickTarget(deskMax: number, _env?: NodeJS.ProcessEnv): number {
  return clampDailyPicks(deskMax);
}

export function countsTowardDailyCap(status: string): boolean {
  return status === "queued" || status === "posting" || status === "posted" || status === "graded";
}

export function remainingDailySlots(target: number, committed: number): number {
  return Math.max(0, clampDailyPicks(target) - Math.max(0, committed));
}

export type CapPick = { gameId: string; status: string; startAt: string };

/** Today's PT official tickets. Skipped/PASS never count. Yesterday never consumes today. */
export function officialPicksForPtDay(picks: CapPick[], now = new Date()): CapPick[] {
  return picks.filter((p) => countsTowardDailyCap(p.status) && isOfficialDay(p.startAt, now));
}

/** Ranked game ids still allowed onto today's card after committed tickets. */
export function nextOfficialSlots(
  rankedIds: string[],
  committed: CapPick[],
  target: number,
  now = new Date(),
): string[] {
  const today = officialPicksForPtDay(committed, now);
  const remaining = remainingDailySlots(target, today.length);
  const taken = new Set(today.map((p) => p.gameId));
  return rankedIds.filter((id) => !taken.has(id)).slice(0, remaining);
}

/** Rank every qualifying game on today's card. Not one-per-sport. */
export function bestOnSlate(
  games: GameCard[],
  minEdge = 3,
  minConf = 58,
  now = new Date(),
): GameCard[] {
  return games
    .filter((g) => {
      const league = LEAGUE_BY_ID[g.league];
      if (!league?.official) return false;
      if (g.status !== "scheduled") return false;
      if (!isOfficialDay(g.startAt, now)) return false;
      const start = new Date(g.startAt).getTime();
      if (!Number.isFinite(start) || start <= now.getTime()) return false;
      return Boolean(g.rank && g.rank.edgePct >= minEdge && g.rank.confidence >= minConf);
    })
    .sort((a, b) => (b.rank?.edgePct ?? 0) - (a.rank?.edgePct ?? 0));
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
