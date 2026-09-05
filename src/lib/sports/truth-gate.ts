import { isPlayableRank, LOW_DATA_QUALITY } from "./data-quality.ts";
import { gameFreshness } from "./freshness.ts";
import { buildFreezeSnapshot, type FreezeSnapshot } from "./freeze.ts";
import { isDraftKingsLine } from "./odds-api.ts";
import { isFreshOfficialDkCache } from "./free-beta.ts";
import { lineFor, priceFor } from "./odds.ts";
import { unitsFor } from "./rank.ts";
import { selectionLabel } from "./odds.ts";
import type { GameCard, PassReason, RankPick } from "./types.ts";

export const START_TIME_TOLERANCE_MS = 30 * 60_000;
export const STARTER_WINDOW_MS = 180 * 60_000;

export type QueuedContext = {
  gameId: string;
  league: string;
  homeName: string;
  awayName: string;
  startAt: string;
  espnId?: string | null;
  market: string;
  homeStarter?: string | null;
  awayStarter?: string | null;
  freezeJson?: string | null;
  status?: string;
};

export type TruthFail = { ok: false; reason: PassReason; detail: string };
export type TruthPass = { ok: true; rank: RankPick; freeze: FreezeSnapshot; units: number; selection: string; lockedOdds: number; lockedLine: number | null };

function finiteProb(p: number): boolean {
  return Number.isFinite(p) && p > 0 && p < 1;
}

export function starterIdentity(game: GameCard): { home: string | null; away: string | null } {
  return { home: game.home.starter?.name ?? null, away: game.away.starter?.name ?? null };
}

export function startersChanged(queued: QueuedContext, live: GameCard): boolean {
  const liveId = starterIdentity(live);
  if (!queued.homeStarter && !queued.awayStarter) return false;
  if (queued.homeStarter && liveId.home && queued.homeStarter !== liveId.home) return true;
  if (queued.awayStarter && liveId.away && queued.awayStarter !== liveId.away) return true;
  return false;
}

export function startersMissingInWindow(live: GameCard, now = Date.now()): boolean {
  if (live.league !== "mlb") return false;
  const start = new Date(live.startAt).getTime();
  if (!Number.isFinite(start) || start - now > STARTER_WINDOW_MS || start <= now) return false;
  return !live.home.starter?.name || !live.away.starter?.name;
}

export function gradeTruth(
  pick: { status: string; gameId: string; league: string; freezeJson?: string | null; homeAbbr?: string | null; awayAbbr?: string | null },
  game: GameCard,
): { ok: true } | { ok: false; reason: PassReason; detail: string } {
  if (pick.status !== "posted") return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Only posted tickets grade." };
  if (pick.gameId !== game.id) return { ok: false, reason: "PASS_GAME_MISMATCH", detail: "Grade game id mismatch." };
  if (pick.league && pick.league !== game.league) return { ok: false, reason: "PASS_GAME_MISMATCH", detail: "Grade league mismatch." };
  if (game.status === "postponed") return { ok: false, reason: "PASS_POSTPONED", detail: "void" };
  if (game.status === "cancelled") return { ok: false, reason: "PASS_CANCELLED", detail: "void" };
  if (game.status === "suspended") return { ok: false, reason: "PASS_DATA_CONFLICT", detail: "suspended" };
  if (game.status !== "final") return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Not final." };
  if (game.home.score == null || game.away.score == null) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Final score missing." };
  }
  return { ok: true };
}

export function prePostTruthCheck(input: {
  queued: QueuedContext;
  live: GameCard;
  rank: RankPick | null;
  minEdge: number;
  minConf: number;
  dailyCapOk?: boolean;
  now?: number;
}): TruthFail | TruthPass {
  const now = input.now ?? Date.now();
  const { queued, live } = input;
  if (queued.freezeJson || queued.status === "posted") {
    return { ok: false, reason: "PASS_ALREADY_POSTED", detail: "Posting token already consumed." };
  }
  if (input.dailyCapOk === false) return { ok: false, reason: "PASS_DAILY_CAP", detail: "Daily cap already filled." };
  if (!live) return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Game missing from slate." };
  if (live.id !== queued.gameId) return { ok: false, reason: "PASS_EVENT_ID_CONFLICT", detail: "Live id does not match ticket." };
  if (live.league !== queued.league) return { ok: false, reason: "PASS_GAME_MISMATCH", detail: "League mismatch." };
  if (live.home.name !== queued.homeName || live.away.name !== queued.awayName) {
    return { ok: false, reason: "PASS_GAME_MISMATCH", detail: "Team names do not match." };
  }
  const queuedStart = new Date(queued.startAt).getTime();
  const liveStart = new Date(live.startAt).getTime();
  if (!Number.isFinite(queuedStart) || !Number.isFinite(liveStart)) {
    return { ok: false, reason: "PASS_START_TIME_MISMATCH", detail: "Start time unreadable." };
  }
  if (Math.abs(queuedStart - liveStart) > START_TIME_TOLERANCE_MS) {
    return { ok: false, reason: "PASS_DATA_CONFLICT", detail: `Start moved ${queued.startAt} → ${live.startAt}` };
  }
  if (live.status === "postponed") return { ok: false, reason: "PASS_POSTPONED", detail: "Postponed." };
  if (live.status === "cancelled") return { ok: false, reason: "PASS_CANCELLED", detail: "Cancelled." };
  if (live.status === "in_progress" || live.status === "final" || liveStart <= now) {
    return { ok: false, reason: "PASS_GAME_STARTED", detail: "Game already started." };
  }
  if (live.status !== "scheduled") return { ok: false, reason: "PASS_DATA_CONFLICT", detail: `Status ${live.status}` };
  if (!isDraftKingsLine(live.odds)) return { ok: false, reason: "PASS_DK_UNAVAILABLE", detail: "Line is not verified DraftKings." };
  const dkAge = live.odds.capturedAt ? now - new Date(live.odds.capturedAt).getTime() : null;
  if (!isFreshOfficialDkCache(dkAge)) return { ok: false, reason: "PASS_DK_STALE", detail: "DraftKings capturedAt too old." };

  if (startersMissingInWindow(live, now)) {
    return { ok: false, reason: "PASS_MISSING_STARTER", detail: "Both MLB starters required in the post window." };
  }
  if (startersChanged(queued, live) && startersMissingInWindow(live, now)) {
    return { ok: false, reason: "PASS_STARTER_CHANGED", detail: "Starter changed and current arms are missing." };
  }

  const rank = input.rank;
  if (!rank) return { ok: false, reason: "PASS_EDGE_DIED", detail: "Rerank produced no play." };
  if (rank.passReason === "PASS_LOW_DATA_QUALITY" || (rank.dataQuality ?? 100) < LOW_DATA_QUALITY) {
    return { ok: false, reason: "PASS_LOW_DATA_QUALITY", detail: `Data quality ${rank.dataQuality ?? 0}.` };
  }
  if (rank.passReason === "PASS_MISSING_STARTER") return { ok: false, reason: "PASS_MISSING_STARTER", detail: rank.passReason };
  if (!finiteProb(rank.probability)) return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Model probability not in (0,1)." };
  if (!rank.model || !/^v2-/.test(rank.model)) return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Unknown model version." };
  if (!isPlayableRank(rank, input.minEdge, input.minConf)) {
    if (rank.confidence < input.minConf) return { ok: false, reason: "PASS_LOW_CONFIDENCE", detail: `Confidence ${rank.confidence}.` };
    return { ok: false, reason: "PASS_EDGE_DIED", detail: `Fresh DK edge ${rank.edgePct.toFixed(1)}% below ${input.minEdge}.` };
  }
  const lockedOdds = priceFor(live.odds, rank.market, rank.side);
  if (lockedOdds == null) return { ok: false, reason: "PASS_DK_UNAVAILABLE", detail: "Selected market missing on fresh DK." };
  const lockedLine = lineFor(live.odds, rank.market, rank.side);
  const units = unitsFor(rank.confidence);
  const selection = selectionLabel({
    market: rank.market,
    side: rank.side,
    homeAbbr: live.home.abbr,
    awayAbbr: live.away.abbr,
    line: lockedLine,
    price: lockedOdds,
  });
  const freeze = buildFreezeSnapshot({
    rank,
    units,
    lockedOdds,
    lockedLine,
    selection,
    gameId: live.id,
    odds: live.odds,
    homeTeam: live.home.name,
    awayTeam: live.away.name,
    startAt: live.startAt,
    league: live.league,
    marketProbability: rank.noVigImplied ?? null,
    freshness: gameFreshness(live, now),
  });
  if (freeze.llmFacts !== false) return { ok: false, reason: "PASS_DATA_CONFLICT", detail: "LLM facts blocked on freeze." };
  return { ok: true, rank, freeze, units, selection, lockedOdds, lockedLine };
}
