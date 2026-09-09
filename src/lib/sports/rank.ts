import { isOfficialDay } from "./day.ts";
import { isPlayableRank, isSoftFloorEligibleRank } from "./data-quality.ts";
import { LEAGUE_BY_ID } from "./leagues.ts";
import { rankMlb } from "./models/mlb.ts";
import { rankNba } from "./models/nba.ts";
import { rankNcaaf } from "./models/ncaaf.ts";
import { rankNfl } from "./models/nfl.ts";
import { rankNhl } from "./models/nhl.ts";
import { rankUfc } from "./models/ufc.ts";
import { rankWnba } from "./models/wnba.ts";
import type { GameCard, PickTier, RankPick } from "./types.ts";

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

/** Official stake sizing: LOCK = 1u, DESK/soft_floor = 0.5u (not confidence-scaled). */
export function unitsForTier(tier: PickTier): number {
  return tier === "soft_floor" ? 0.5 : 1;
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

/** Rank every hard-edge LOCK on the live card. Not one-per-sport. */
export function bestOnSlate(
  games: GameCard[],
  minEdge = 3,
  minConf = 58,
  now = new Date(),
): GameCard[] {
  return liveSlateGames(games, now)
    .filter((g) => isPlayableRank(g.rank, minEdge, minConf))
    .sort((a, b) => (b.rank?.edgePct ?? 0) - (a.rank?.edgePct ?? 0));
}

export type SlatePick = {
  game: GameCard;
  tier: PickTier;
};

/** Future official scheduled tip in the loaded slate (not yet started). */
function upcomingOfficialFilter(g: GameCard, now: Date): boolean {
  const league = LEAGUE_BY_ID[g.league];
  if (!league?.official) return false;
  if (g.status !== "scheduled") return false;
  const start = new Date(g.startAt).getTime();
  if (!Number.isFinite(start) || start <= now.getTime()) return false;
  return true;
}

/**
 * Live card pool: prefer today's PT future tips when any remain.
 * When the PT calendar day is empty (common Sat night → Sunday slate), fall back
 * to any loaded upcoming official tip so Discord is not empty while games exist.
 */
export function liveSlateGames(games: GameCard[], now = new Date()): GameCard[] {
  const upcoming = games.filter((g) => upcomingOfficialFilter(g, now));
  const today = upcoming.filter((g) => isOfficialDay(g.startAt, now));
  return today.length > 0 ? today : upcoming;
}

/** Research-only soft-floor board: best ranked tickets that missed the hard edge/confidence gate. Never auto-queued to Discord. */
export function softFloorOnSlate(games: GameCard[], minEdge = 3, minConf = 58, now = new Date()): GameCard[] {
  const pool = liveSlateGames(games, now);
  const poolIds = new Set(pool.map((g) => g.id));
  const locks = new Set(bestOnSlate(games, minEdge, minConf, now).map((g) => g.id));
  return games
    .filter((g) => {
      if (!poolIds.has(g.id)) return false;
      if (locks.has(g.id)) return false;
      if (!isSoftFloorEligibleRank(g.rank)) return false;
      // Soft floor only when the ticket would fail the hard gate.
      return !isPlayableRank(g.rank, minEdge, minConf);
    })
    .sort((a, b) => (b.rank?.edgePct ?? 0) - (a.rank?.edgePct ?? 0));
}

/**
 * Official Discord card: hard LOCKs only.
 * DAILY_PICK_TARGET is a max/cap — never a floor that invents DESK/soft-floor posts.
 * Zero qualifying locks on a bad slate = correct PASS (empty card).
 * softFloorOnSlate remains for research/internal logging only.
 */
export function selectSlatePicks(
  games: GameCard[],
  minEdge = 3,
  minConf = 58,
  _target = DEFAULT_DAILY_PICKS,
  now = new Date(),
): SlatePick[] {
  // _target cap applied by planDailyCard / remaining slots — not by inventing soft fills
  if (liveSlateGames(games, now).length === 0) return [];
  const locks = bestOnSlate(games, minEdge, minConf, now);
  // Full lock board for planDailyCard rotation; caller caps by remaining slots.
  return locks.map((game) => ({
    game: { ...game, rank: game.rank ? { ...game.rank, pickTier: "lock" as const } : null },
    tier: "lock" as const,
  }));
}

/** Ranked game ids in official card priority order (LOCKs only). */
export function slatePickIds(picks: SlatePick[]): string[] {
  return picks.map((p) => p.game.id);
}

