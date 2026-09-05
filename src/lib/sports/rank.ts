import { isOfficialDay } from "./day.ts";
import { isPlayableRank } from "./data-quality.ts";
import { LEAGUE_BY_ID } from "./leagues.ts";
import { rankMlb } from "./models/mlb.ts";
import { rankNba } from "./models/nba.ts";
import { rankNcaaf } from "./models/ncaaf.ts";
import { rankNfl } from "./models/nfl.ts";
import { rankNhl } from "./models/nhl.ts";
import { rankUfc } from "./models/ufc.ts";
import { rankWnba } from "./models/wnba.ts";
import type { GameCard, RankPick } from "./types.ts";

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
      return null;
  }
}

export function rankGames(games: GameCard[]): GameCard[] {
  return games.map((game) =>
    game.status === "scheduled" ? { ...game, rank: rankGame(game) } : { ...game, rank: game.rank ?? null },
  );
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
  return status === "queued" || status === "delivery_unknown" || status === "posting" || status === "posted" || status === "graded";
}

/** Locked tickets are sacred. Queued stays rotatable until posting starts. */
export function isLockedOfficialStatus(status: string): boolean {
  return status === "delivery_unknown" || status === "posting" || status === "posted" || status === "graded";
}

export const ROTATE_SKIP_REASON = "Rotated off daily card — stronger play ranked higher.";

export function remainingDailySlots(target: number, committed: number): number {
  return Math.max(0, clampDailyPicks(target) - Math.max(0, committed));
}

export type CapPick = { gameId: string; status: string; startAt: string };

/** Today's PT official tickets. Skipped/PASS never count. Yesterday never consumes today. */
export function officialPicksForPtDay(picks: CapPick[], now = new Date()): CapPick[] {
  return picks.filter((p) => countsTowardDailyCap(p.status) && isOfficialDay(p.startAt, now));
}

export function lockedOfficialForPtDay(picks: CapPick[], now = new Date()): CapPick[] {
  return picks.filter((p) => isLockedOfficialStatus(p.status) && isOfficialDay(p.startAt, now));
}

export type DailyCardPlan = {
  keepIds: string[];
  rotateOffIds: string[];
  remaining: number;
  lockedCount: number;
};

/**
 * Queued tickets are provisional. Posting/posted/graded never rotate.
 * remainingSlots = target - locked. Keep set is the current best remaining games.
 */
export function planDailyCard(
  rankedIds: string[],
  tickets: CapPick[],
  target: number,
  now = new Date(),
): DailyCardPlan {
  const today = officialPicksForPtDay(tickets, now);
  const locked = today.filter((p) => isLockedOfficialStatus(p.status));
  const queued = today.filter((p) => p.status === "queued");
  const remaining = remainingDailySlots(target, locked.length);
  const lockedIds = new Set(locked.map((p) => p.gameId));
  const keepIds = rankedIds.filter((id) => !lockedIds.has(id)).slice(0, remaining);
  const keepSet = new Set(keepIds);
  const rotateOffIds = [...new Set(queued.map((p) => p.gameId).filter((id) => !keepSet.has(id)))];
  return { keepIds, rotateOffIds, remaining, lockedCount: locked.length };
}

/** Ranked game ids still allowed onto today's card after locked tickets. */
export function nextOfficialSlots(
  rankedIds: string[],
  committed: CapPick[],
  target: number,
  now = new Date(),
): string[] {
  return planDailyCard(rankedIds, committed, target, now).keepIds;
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
      return isPlayableRank(g.rank, minEdge, minConf);
    })
    .sort((a, b) => (b.rank?.edgePct ?? 0) - (a.rank?.edgePct ?? 0));
}
