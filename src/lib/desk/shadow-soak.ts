import { canQueueOfficial } from "../models-v3/registry.ts";
import { ptDayKey } from "../sports/day.ts";
import { expectedValuePct } from "../sports/value.ts";
import { isDraftKingsLine } from "../sports/odds-api.ts";
import { isFreshOfficialDkCache } from "../sports/free-beta.ts";
import { rankGame } from "../sports/rank.ts";
import { prePostTruthCheck, type QueuedContext } from "../sports/truth-gate.ts";
import { postAttemptBlockReason, SOFT_FLOOR_EXPIRED_REASON } from "./lifecycle.ts";
import { isShadowSoak } from "./production-policy.ts";
import type { GameCard, Market } from "../sports/types.ts";

export { isShadowSoak } from "./production-policy.ts";

export type SoakEvaluation = {
  soakKey: string;
  gameId: string;
  league: string;
  market: string;
  selection: string;
  side: string;
  lockedLine: number | null;
  postedPrice: number | null;
  sportsbook: string;
  opposingPrice: number | null;
  modelVersion: string;
  modelProbability: number | null;
  noVigProbability: number | null;
  edgePct: number | null;
  expectedValuePct: number | null;
  dataQuality: number | null;
  confidence: number | null;
  wouldHavePosted: boolean;
  skipReason: string | null;
  freezeJson: string | null;
  postedAt: string | null;
};

export type SoakStored = {
  soakKey: string;
  wouldHavePosted: boolean;
  postedPrice: number | null;
  freezeJson: string | null;
  skipReason: string | null;
};

export type SoakRecordResult =
  | { ok: true; recorded: number; wouldHavePosted: number }
  | { ok: false; recorded: 0; wouldHavePosted: null; error: string };

export type SoakRecorderState = {
  ok: boolean;
  error: string | null;
  at: string | null;
  lastWouldHavePosted: number | null;
};

let soakRecorderState: SoakRecorderState = {
  ok: true,
  error: null,
  at: null,
  lastWouldHavePosted: null,
};

export function soakRecorderHealth(): SoakRecorderState {
  return soakRecorderState;
}

export function markSoakRecorderOk(wouldHavePosted: number): void {
  soakRecorderState = {
    ok: true,
    error: null,
    at: new Date().toISOString(),
    lastWouldHavePosted: wouldHavePosted,
  };
}

export function markSoakRecorderFailed(error: string): void {
  soakRecorderState = {
    ok: false,
    error,
    at: new Date().toISOString(),
    lastWouldHavePosted: null,
  };
}

export function resetSoakRecorderHealthForTests(): void {
  soakRecorderState = { ok: true, error: null, at: null, lastWouldHavePosted: null };
}

/** Same identity philosophy as official tickets, plus market/selection/model/PT day. */
export function soakKey(input: {
  league: string;
  gameId: string;
  market: string;
  selection: string;
  modelVersion: string;
  startAt: string;
}): string {
  const start = new Date(input.startAt);
  const day = Number.isNaN(start.getTime()) ? ptDayKey() : ptDayKey(start);
  return `${day}:${input.league}:${input.gameId}:${input.market}:${input.selection}:${input.modelVersion}:soak`;
}

/** Existing WOULD_POST freeze wins. Failures may upgrade to WOULD_POST once. Never mutate a frozen price. */
export function soakConflictAction(existing: SoakStored, incoming: SoakEvaluation): "skip" | "upgrade" {
  if (existing.soakKey !== incoming.soakKey) return "skip";
  if (existing.wouldHavePosted) return "skip";
  if (incoming.wouldHavePosted) return "upgrade";
  return "skip";
}

function failEval(game: GameCard, reason: string): SoakEvaluation {
  const rank = game.rank;
  return {
    soakKey: soakKey({
      league: game.league,
      gameId: game.id,
      market: rank?.market ?? "moneyline",
      selection: rank?.selection ?? "",
      modelVersion: rank?.model ?? "",
      startAt: game.startAt,
    }),
    gameId: game.id,
    league: game.league,
    market: rank?.market ?? "moneyline",
    selection: rank?.selection ?? "",
    side: rank?.side ?? "home",
    lockedLine: rank?.line ?? null,
    postedPrice: null,
    sportsbook: game.odds.book,
    opposingPrice: null,
    modelVersion: rank?.model ?? "",
    modelProbability: rank?.probability ?? null,
    noVigProbability: rank?.noVigImplied ?? null,
    edgePct: rank?.edgePct ?? null,
    expectedValuePct: null,
    dataQuality: rank?.dataQuality ?? null,
    confidence: rank?.confidence ?? null,
    wouldHavePosted: false,
    skipReason: reason,
    freezeJson: null,
    postedAt: null,
  };
}

/**
 * Same final post gate as postPickById (truth + freeze), without Discord.
 * Reuses prePostTruthCheck / postAttemptBlockReason / canQueueOfficial. No weaker duplicate.
 */
export function evaluateFinalPostGate(game: GameCard, minEdge: number, minConf: number, now = Date.now()): SoakEvaluation {
  const rank = game.rank;
  if (!rank) return failEval(game, "PASS_NO_EDGE");
  if (!canQueueOfficial(rank.model)) return failEval(game, "PASS_CRITICAL_DATA_MISSING");
  const blocked = postAttemptBlockReason({
    status: "queued",
    gameStatus: game.status,
    gameStarted: new Date(game.startAt).getTime() <= now,
    freezeJson: null,
  });
  if (blocked) return failEval(game, blocked.includes("PASS_") ? blocked.split(":")[0]!.trim() : blocked);

  const queued: QueuedContext = {
    gameId: game.id,
    league: game.league,
    homeName: game.home.name,
    awayName: game.away.name,
    startAt: game.startAt,
    espnId: game.espnId,
    market: rank.market,
    homeStarter: game.home.starter?.name ?? null,
    awayStarter: game.away.starter?.name ?? null,
    freezeJson: null,
    status: "queued",
    softFloor: false,
    pickTier: "lock",
  };
  const gate = prePostTruthCheck({
    queued,
    live: game,
    rank,
    minEdge,
    minConf,
    softFloor: false,
    now,
  });
  if (!gate.ok) return failEval(game, gate.reason);
  if (gate.rank.pickTier === "soft_floor" || gate.freeze.pickTier === "soft_floor") {
    return failEval(game, SOFT_FLOOR_EXPIRED_REASON.split(":")[0] ?? SOFT_FLOOR_EXPIRED_REASON);
  }
  if (!canQueueOfficial(gate.rank.model)) return failEval(game, "PASS_NO_EDGE");

  return {
    soakKey: soakKey({
      league: game.league,
      gameId: game.id,
      market: gate.rank.market,
      selection: gate.selection,
      modelVersion: gate.rank.model,
      startAt: game.startAt,
    }),
    gameId: game.id,
    league: game.league,
    market: gate.rank.market,
    selection: gate.selection,
    side: gate.rank.side,
    lockedLine: gate.lockedLine,
    postedPrice: gate.lockedOdds,
    sportsbook: gate.freeze.sportsbook ?? game.odds.book,
    opposingPrice: gate.freeze.opposingPrice ?? null,
    modelVersion: gate.rank.model,
    modelProbability: gate.rank.probability,
    noVigProbability: gate.rank.noVigImplied ?? gate.freeze.noVigProbability ?? null,
    edgePct: gate.rank.edgePct,
    expectedValuePct: expectedValuePct(gate.rank.probability, gate.lockedOdds),
    dataQuality: gate.rank.dataQuality ?? null,
    confidence: gate.rank.confidence,
    wouldHavePosted: true,
    skipReason: null,
    freezeJson: JSON.stringify(gate.freeze),
    postedAt: gate.freeze.frozenAt,
  };
}

type DkConfirm = (
  game: GameCard,
  market: Market,
) => Promise<{ ok: true; game: GameCard } | { ok: false; error: string }>;

async function liveForSoak(game: GameCard, confirmDk: DkConfirm): Promise<GameCard | SoakEvaluation> {
  const rank = game.rank;
  if (!rank) return failEval(game, "PASS_NO_EDGE");
  const age = game.odds.capturedAt ? Date.now() - Date.parse(game.odds.capturedAt) : null;
  const freshDk = isDraftKingsLine(game.odds) && isFreshOfficialDkCache(age);
  if (freshDk) return game;
  try {
    const verified = await confirmDk(game, rank.market);
    if (!verified.ok) return failEval(game, verified.error.startsWith("PASS_") ? verified.error.split(":")[0]!.trim() : "PASS_DK_UNAVAILABLE");
    const nextRank = rankGame(verified.game) ?? verified.game.rank ?? rank;
    return { ...verified.game, rank: nextRank };
  } catch {
    return failEval(game, "PASS_DK_UNAVAILABLE");
  }
}

export async function evaluateSoakCandidates(
  games: GameCard[],
  minEdge: number,
  minConf: number,
  opts: { confirmDk?: DkConfirm; now?: number } = {},
): Promise<SoakEvaluation[]> {
  if (!games.length) return [];
  const confirmDk = opts.confirmDk ?? (await import("./dk-verify.ts")).confirmDraftKings;
  const now = opts.now ?? Date.now();
  const out: SoakEvaluation[] = [];
  for (const game of games) {
    const live = await liveForSoak(game, confirmDk);
    if ("wouldHavePosted" in live && "soakKey" in live) {
      out.push(live);
      continue;
    }
    out.push(evaluateFinalPostGate(live, minEdge, minConf, now));
  }
  return out;
}

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

async function emitSoakFailure(error: string, alert?: (code: string, detail: string) => Promise<void>): Promise<void> {
  markSoakRecorderFailed(error);
  try {
    const { recordEvent } = await import("./telemetry.ts");
    await recordEvent("soak_recorder_failure", error);
  } catch {
    /* health stays red even if telemetry insert fails */
  }
  try {
    if (alert) {
      await alert("DATABASE_ERROR", error);
    } else {
      const { alertOwner } = await import("./alerts.ts");
      await alertOwner("DATABASE_ERROR", error);
    }
  } catch {
    /* private alert must not hide the recorder failure */
  }
}

export async function recordSoakEvaluations(
  evals: SoakEvaluation[],
  deps: { sql?: SqlTag; alert?: (code: string, detail: string) => Promise<void> } = {},
): Promise<SoakRecordResult> {
  if (!isShadowSoak()) return { ok: true, recorded: 0, wouldHavePosted: 0 };
  const would = evals.filter((e) => e.wouldHavePosted).length;
  if (!evals.length) {
    markSoakRecorderOk(0);
    return { ok: true, recorded: 0, wouldHavePosted: 0 };
  }
  try {
    const sql: SqlTag = deps.sql ?? (await (await import("../db.ts")).getSql() as unknown as SqlTag);
    for (const d of evals) {
      await sql`
        insert into soak_tickets (
          soak_key, game_id, league, market, selection, side, locked_line, posted_price, posted_at,
          sportsbook, opposing_price, model_version, model_probability, no_vig_probability,
          edge_pct, expected_value_pct, data_quality, confidence, freeze_json,
          would_have_posted, skip_reason
        ) values (
          ${d.soakKey}, ${d.gameId}, ${d.league}, ${d.market}, ${d.selection}, ${d.side}, ${d.lockedLine}, ${d.postedPrice}, ${d.postedAt},
          ${d.sportsbook}, ${d.opposingPrice}, ${d.modelVersion}, ${d.modelProbability}, ${d.noVigProbability},
          ${d.edgePct}, ${d.expectedValuePct}, ${d.dataQuality}, ${d.confidence}, ${d.freezeJson},
          ${d.wouldHavePosted}, ${d.skipReason}
        )
        on conflict (soak_key) do update set
          would_have_posted = true,
          skip_reason = null,
          posted_price = excluded.posted_price,
          posted_at = excluded.posted_at,
          sportsbook = excluded.sportsbook,
          opposing_price = excluded.opposing_price,
          model_probability = excluded.model_probability,
          no_vig_probability = excluded.no_vig_probability,
          edge_pct = excluded.edge_pct,
          expected_value_pct = excluded.expected_value_pct,
          data_quality = excluded.data_quality,
          confidence = excluded.confidence,
          freeze_json = excluded.freeze_json,
          locked_line = excluded.locked_line,
          selection = excluded.selection,
          side = excluded.side
        where soak_tickets.would_have_posted = false
          and excluded.would_have_posted = true
      `;
    }
    markSoakRecorderOk(would);
    return { ok: true, recorded: evals.length, wouldHavePosted: would };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Soak recorder database failure";
    await emitSoakFailure(
      `Soak recorder failed: ${error}. Certification warehouse is NOT 0 hypothetical bets.`,
      deps.alert,
    );
    return { ok: false, recorded: 0, wouldHavePosted: null, error };
  }
}

export async function recordSoakFromCandidates(
  games: GameCard[],
  minEdge: number,
  minConf: number,
  opts: { confirmDk?: DkConfirm; now?: number } = {},
): Promise<SoakRecordResult> {
  if (!isShadowSoak()) return { ok: true, recorded: 0, wouldHavePosted: 0 };
  const evals = await evaluateSoakCandidates(games, minEdge, minConf, opts);
  return recordSoakEvaluations(evals);
}
