import { sqlLocker } from "./sql-locker";
export { sqlLocker } from "./sql-locker";
import { verifiedClosingPrice } from "../sports/closing";
import { flushResultRecaps } from "./result-delivery";
import { syncRecordScoreboard } from "./scoreboard";
import { sendWeeklyRecap } from "./weekly-recap";
import { livePostingEnabled } from "./production-policy";
import { recordEvent } from "./telemetry";
import { getSql } from "@/lib/db";
import { officialKey } from "@/lib/sports/day";
import {
  buildDiscordMessage,
  buildRecapMessage,
  postWebhook,
  resolveWebhook,
} from "@/lib/sports/discord";
import { fetchAllSlates, beginEspnScan, espnScanStats } from "@/lib/sports/espn";
import { mergeFetchedSlate, inLookahead } from "@/lib/sports/slate-merge";
import { gradePick, settle } from "@/lib/sports/grade";
import { impliedFromAmerican } from "@/lib/sports/odds";
import { prePostTruthCheck, gradeTruth, type QueuedContext } from "@/lib/sports/truth-gate";
import { isManualSource, NEEDS_MANUAL_GRADE } from "@/lib/sports/manual-post";
import { alertOwner } from "./alerts";
import { automationStatus } from "./health";
import { isFreeBetaMode } from "@/lib/sports/free-beta";
import { isPaperLedger, paperLockMessage, paperSimulateSend, activeLedger } from "@/lib/sports/paper-mode";
import { mergeDraftKingsOdds } from "@/lib/sports/odds-api";
import { dailyPickTarget, planDailyCard, rankGame, rankGames, ROTATE_SKIP_REASON, selectSlatePicks, unitsForTier } from "@/lib/sports/rank";
import { formatWhy } from "@/lib/sports/why";
import { confirmDraftKings, pruneFreeBetaCaches } from "./dk-verify";
import { recordClosingResult, recordPostedPrediction, recordPregameSnapshots } from "./warehouse";
import { recordV2Candidates } from "@/lib/sports/candidate-log";
import { recordMlbShadow, gradeShadowPredictions } from "@/lib/models-v3/shadow-store";
import { gradeDisposition, UNPOSTED_SKIP } from "./posting";
import { queuePostAt } from "./queue-post-at";
import { sendOnce } from "./post-pipeline";
import type { GameCard, PickRow } from "@/lib/sports/types";
import {
  addLog,
  clearWorkerLock,
  loadGames,
  loadTodayOfficial,
  loadLatestPicksByGames,
  loadRecord,
  loadMeta,
  readDesk,
  readWebhook,
  touchScan,
  touchCronTick,
  tryWorkerLock,
  upsertGames,
} from "./store";

const verifiedThisTick = new WeakMap<GameCard, number>();

function asPickRow(partial: Partial<PickRow> & Pick<PickRow, "id" | "gameId" | "sport" | "league" | "matchup" | "market" | "selection" | "side" | "lockedOdds" | "lockedOddsJson" | "reason" | "confidence" | "edgePct" | "units" | "status" | "startAt" | "postAt" | "createdAt">): PickRow {
  return {
    lockedLine: null,
    research: null,
    result: null,
    profitUnits: null,
    postedAt: null,
    gradedAt: null,
    discordMessage: null,
    discordMessageId: null,
    officialKey: null,
    skipReason: null,
    modelVersion: null,
    modelProbability: null,
    modelEdge: null,
    freezeJson: null,
    selectedOdds: null,
    postedOdds: null,
    closingOdds: null,
    clv: null,
    ledger: "official",
    homeLogo: null,
    awayLogo: null,
    homeAbbr: null,
    awayAbbr: null,
    homeScore: null,
    awayScore: null,
    gameStatus: null,
    pickSource: "auto",
    ...partial,
  };
}

export async function refreshSlate(): Promise<GameCard[]> {
  beginEspnScan();
  const raw = await fetchAllSlates();
  const merged = await mergeDraftKingsOdds(raw);
  const windowed = merged.filter((g) => inLookahead(g));
  const ranked = rankGames(windowed);
  if (ranked.length) await upsertGames(ranked);
  const previous = await loadGames();
  const next = mergeFetchedSlate(ranked, previous);
  await recordPregameSnapshots(next);
  await recordV2Candidates(next);
  await recordMlbShadow(next);
  await pruneFreeBetaCaches();
  const stats = espnScanStats();
  if (stats.espn_error_count) {
    await recordEvent("espn_failure", `${stats.espn_error_count} requests failed`);
    await alertOwner("ESPN_FAIL", "Some ESPN data unavailable. Affected games require fresh verified data.");
  } else { await touchScan("scan"); await recordEvent("scan_success"); }
  return next;
}

async function webhookUrl(): Promise<string> {
  const stored = await readWebhook();
  return resolveWebhook(stored).url;
}

export async function gradeOpenPicks(games: GameCard[]): Promise<number> {
  const sql = await getSql();
  const open = await sql<{
    id: number;
    game_id: string;
    market: string;
    side: string;
    selection: string;
    locked_line: number | null;
    locked_odds: number;
    locked_odds_json: string;
    units: number;
    status: string;
    sport: string;
    league: string;
    matchup: string;
    reason: string;
    confidence: number;
    edge_pct: number;
    start_at: string;
    post_at: string;
    posted_odds: number | null;
    model_version: string | null;
    ledger: string | null;
    pick_source: string | null;
    needs_manual_grade: boolean;
    freeze_json: string | null;
    closing_snapshot_json: string | null;
  }>`
    select * from picks
    where result is null and status in ('queued','posting','posted')
  `;
  const byId = new Map(games.map((g) => [g.id, g]));
  let graded = 0;
  for (const row of open) {
    const game = byId.get(row.game_id);
    if (!game) {
      if (row.status === "posted" && Date.parse(String(row.start_at)) < Date.now() - 24 * 3600_000)
        await alertOwner("GRADE_STUCK", `Ticket ${row.id}: final event unavailable; no grade guessed.`);
      continue;
    }
    const started = new Date(game.startAt).getTime() <= Date.now();
    const disp = gradeDisposition(row.status as PickRow["status"], started, game.status);
    if (disp === "skip-unposted") {
      await sql`
        update picks set status = 'skipped', skip_reason = ${UNPOSTED_SKIP}, result = null, profit_units = null
        where id = ${row.id} and status in ('queued','posting')
      `;
      await addLog("skip", UNPOSTED_SKIP, game.sport);
      continue;
    }
    if (row.status === "posted" && (game.status === "cancelled" || game.status === "postponed")) {
      await sql`update picks set needs_manual_grade = true, skip_reason = 'NEEDS_MANUAL_GRADE: sportsbook postponement/cancellation rules required' where id = ${row.id} and status = 'posted'`;
      await alertOwner("GRADE_STUCK", "Postponed/cancelled ticket requires sportsbook settlement review.");
      continue;
    }
    if (disp !== "grade") continue;
    if (row.status !== "posted") continue;
    if (disp === "grade") {
      const gt = gradeTruth({ status: "posted", gameId: row.game_id, league: row.league, freezeJson: row.freeze_json }, game);
      if (!gt.ok) {
        await alertOwner(gt.reason === "PASS_GAME_MISMATCH" ? "DATA_CONFLICT" : "GRADE_STUCK", `Ticket ${row.id}: ${gt.detail}`);
        continue;
      }
    }
    const fake = asPickRow({
      id: row.id,
      gameId: row.game_id,
      sport: row.sport,
      league: row.league,
      matchup: row.matchup,
      market: row.market as PickRow["market"],
      selection: row.selection,
      side: row.side as PickRow["side"],
      lockedLine: row.locked_line,
      lockedOdds: row.locked_odds,
      lockedOddsJson: JSON.parse(row.locked_odds_json || "{}"),
      reason: row.reason,
      confidence: row.confidence,
      edgePct: row.edge_pct,
      units: Number(row.units),
      status: "posted",
      startAt: String(row.start_at),
      postAt: String(row.post_at),
      createdAt: new Date().toISOString(),
      modelVersion: row.model_version,
      pickSource: isManualSource(row.pick_source) ? row.pick_source as "manual" | "manual_live" : "auto",
      freezeJson: row.freeze_json,
    });
    if (row.needs_manual_grade) continue;
    const result = gradePick(fake, game);
    if (!result) {
      if (disp === "grade" && isManualSource(row.pick_source)) {
        await sql`
          update picks
          set needs_manual_grade = true, skip_reason = ${NEEDS_MANUAL_GRADE}
          where id = ${row.id} and status = 'posted'
        `;
      }
      continue;
    }
    const { profit } = settle(fake, result);
    const closing = verifiedClosingPrice(row.closing_snapshot_json, fake);
    const postedOdds = row.posted_odds ?? row.locked_odds;
    const clv =
      closing != null && postedOdds != null
        ? impliedFromAmerican(closing) - impliedFromAmerican(postedOdds)
        : null;
    const record = await loadRecord();
    if (!isManualSource(row.pick_source) && !isPaperLedger(row.ledger)) {
      record.wins += Number(result === "WIN");
      record.losses += Number(result === "LOSS");
      record.pushes += Number(result === "PUSH");
      record.units += profit;
      record.riskedUnits = (record.riskedUnits ?? 0) + (result === "VOID" ? 0 : fake.units);
      record.pending = Math.max(0, record.pending - 1);
    }
    const recap = buildRecapMessage({ ...fake, result, profitUnits: profit }, game, result, profit, record);
    const updated = await sql<{id: number}>`
      update picks
      set status = 'graded', result = ${result}, profit_units = ${profit}, graded_at = now(),
          closing_odds = ${closing}, clv = ${clv},
          result_message = ${recap}, result_delivery = ${isPaperLedger(row.ledger) ? null : "queued"}
      where id = ${row.id} and status = 'posted' returning id
    `;
    if (!updated.length) continue;
    await recordEvent('grade_success');
    if (!isManualSource(row.pick_source) && !isPaperLedger(row.ledger)) await recordClosingResult({
      game,
      modelVersion: fake.modelVersion,
      result,
      closingPrice: closing,
      postedPrice: postedOdds,
    });
    await addLog(
      "grade",
      `${fake.matchup} ${result} ${profit >= 0 ? "+" : ""}${profit.toFixed(2)}u`,
      game.sport,
    );
    graded += 1;
  }
  await flushResultRecaps();
  return graded;
}

export async function postPickById(
  pickId: number,
  games: GameCard[],
  minEdge: number,
  minConf: number,
  opts: { ignoreWindow?: boolean; refresh?: boolean; allowLive?: boolean; workerToken?: string } = {},
): Promise<{ ok: boolean; posted: boolean; error?: string; pickId: number }> {
  const sql = await getSql();
  if (!opts.workerToken) return { ok: false, posted: false, pickId, error: "Official posting requires the worker lease" };
  if (opts.refresh) {
    games = await refreshSlate();
  }
  const windowed = opts.ignoreWindow
    ? await sql<{ id: number; game_id: string; selected_odds: number | null }>`
        select id, game_id, selected_odds from picks where id = ${pickId} and status = 'queued' and coalesce(pick_source, 'auto') = 'auto'
      `
    : await sql<{ id: number; game_id: string; selected_odds: number | null }>`
        select id, game_id, selected_odds from picks
        where id = ${pickId} and status = 'queued' and coalesce(pick_source, 'auto') = 'auto' and post_at <= now() and start_at > now()
      `;
  const row = windowed[0];
  if (!row) return { ok: true, posted: false, pickId };

  const game = games.find((g) => g.id === row.game_id);
  if (!game) {
    await sql`update picks set status = 'skipped', skip_reason = ${"PASS_CRITICAL_DATA_MISSING"} where id = ${row.id} and status = 'queued'`;
    return { ok: true, posted: false, pickId };
  }
  if (game.status === "postponed") {
    await sql`update picks set status = 'skipped', skip_reason = ${"PASS_POSTPONED"} where id = ${row.id} and status = 'queued'`;
    return { ok: true, posted: false, pickId };
  }
  if (game.status === "cancelled") {
    await sql`update picks set status = 'skipped', skip_reason = ${"PASS_CANCELLED"} where id = ${row.id} and status = 'queued'`;
    return { ok: true, posted: false, pickId };
  }
  if (game.status !== "scheduled") {
    await sql`update picks set status = 'skipped', skip_reason = ${"PASS_GAME_STARTED"} where id = ${row.id} and status = 'queued'`;
    return { ok: true, posted: false, pickId };
  }

  const queuedMeta = await sql<{ market: string; ledger: string | null }>`select market, ledger from picks where id = ${row.id}`;
  const queuedMarket = (queuedMeta[0]?.market ?? "spread") as import("@/lib/sports/types").Market;
  if (queuedMeta[0]?.ledger !== activeLedger()) return { ok: true, posted: false, pickId, error: "Inactive ledger" };
  const paper = isPaperLedger(queuedMeta[0]?.ledger);
  if (!paper && !livePostingEnabled()) return { ok: true, posted: false, pickId, error: "Live posting is OFF" };
  const receipt = verifiedThisTick.get(game);
  const verified = receipt != null
    ? Date.now() - receipt <= 60_000 ? { ok: true as const, game } : { ok: false as const, error: "PASS_DK_STALE: rerank next tick" }
    : await confirmDraftKings(game, queuedMarket);
  if (!verified.ok) {
    await sql`
      update picks set status = 'skipped', skip_reason = ${verified.error}
      where id = ${row.id} and status = 'queued'
    `;
    await addLog("skip", `${game.sport} ${verified.error}`, game.sport);
    await alertOwner("DK_UNAVAILABLE", verified.error);
    return { ok: true, posted: false, pickId };
  }
  const liveGame = verified.game;
  const freshRank = rankGame(liveGame);

  const full = await sql<{
    id: number;
    sport: string;
    league: string;
    matchup: string;
    reason: string;
    start_at: string;
    post_at: string;
    created_at: string;
    freeze_json: string | null;
    selected_odds: number | null;
    status: string;
    ledger: string | null;
    context_json: string | null;
  }>`select * from picks where id = ${row.id}`;
  const pick = full[0];
  if (!pick) return { ok: false, posted: false, pickId, error: "Pick vanished." };
  if (pick.freeze_json || pick.status === "posted") return { ok: true, posted: false, pickId };

  let ctx: Partial<QueuedContext> = {};
  try {
    ctx = pick.context_json ? (JSON.parse(pick.context_json) as QueuedContext) : {};
  } catch {
    ctx = {};
  }
  const softFloor = ctx.softFloor === true || ctx.pickTier === "soft_floor";
  const gate = prePostTruthCheck({
    queued: {
      gameId: row.game_id,
      league: pick.league,
      homeName: ctx.homeName ?? "",
      awayName: ctx.awayName ?? "",
      startAt: String(pick.start_at),
      espnId: ctx.espnId,
      market: queuedMarket,
      homeStarter: ctx.homeStarter ?? null,
      awayStarter: ctx.awayStarter ?? null,
      freezeJson: pick.freeze_json,
      status: pick.status,
      softFloor,
    },
    live: liveGame,
    rank: freshRank ? { ...freshRank, pickTier: softFloor ? "soft_floor" : freshRank.pickTier ?? "lock" } : null,
    minEdge,
    minConf,
    softFloor,
  });
  if (!gate.ok) {
    await sql`
      update picks set status = 'skipped', skip_reason = ${gate.reason}
      where id = ${row.id} and status = 'queued'
    `;
    await recordEvent(gate.reason.includes("STALE") ? "stale_pass" : "truth_pass", gate.reason);
    await addLog("skip", `${game.sport} ${gate.reason}: ${gate.detail}`, game.sport);
    if (gate.reason === "PASS_DK_STALE" || gate.reason === "PASS_DK_UNAVAILABLE") {
      await alertOwner("DK_UNAVAILABLE", gate.detail);
    }
    if (gate.reason === "PASS_ODDS_EVENT_AMBIGUOUS" || gate.reason === "PASS_DATA_CONFLICT") {
      await alertOwner("AMBIGUOUS_MATCH", gate.detail);
    }
    return { ok: true, posted: false, pickId };
  }

  const factualReason = formatWhy(liveGame, gate.rank);
  Object.assign(gate.freeze, { reason: factualReason });
  const asRow = asPickRow({
    id: pick.id,
    gameId: row.game_id,
    sport: pick.sport,
    league: pick.league,
    matchup: pick.matchup,
    market: gate.rank.market,
    selection: gate.selection,
    side: gate.rank.side,
    lockedLine: gate.lockedLine,
    lockedOdds: gate.lockedOdds,
    lockedOddsJson: liveGame.odds,
    reason: factualReason,
    freezeJson: JSON.stringify(gate.freeze),
    confidence: gate.rank.confidence,
    edgePct: gate.rank.edgePct,
    units: gate.units,
    status: "queued",
    startAt: String(pick.start_at),
    postAt: String(pick.post_at),
    createdAt: String(pick.created_at),
    homeAbbr: liveGame.home.abbr,
    awayAbbr: liveGame.away.abbr,
    modelVersion: gate.rank.model,
    modelProbability: gate.rank.probability,
    modelEdge: gate.rank.edgePct,
  });
  const message = paper ? paperLockMessage(gate.selection) : buildDiscordMessage(asRow, liveGame);
  const hook = await webhookUrl();
  if (!paper && !hook) {
    await addLog("post", "Due pick waiting — no DISCORD_WEBHOOK_URL.", pick.sport);
    return { ok: false, posted: false, pickId, error: "No Discord webhook configured." };
  }

  const result = await sendOnce(
    pick.id,
    sqlLocker(sql, { workerToken: opts.workerToken, target: (await loadMeta()).maxDailyPicks, ledger: activeLedger() }),
    paper ? paperSimulateSend : () => postWebhook(hook, message),
    {
      freezeJson: JSON.stringify(gate.freeze),
      discordMessage: message,
      selection: gate.selection,
      market: gate.rank.market,
      side: gate.rank.side,
      lockedOdds: gate.lockedOdds,
      lockedLine: gate.lockedLine,
      lockedOddsJson: JSON.stringify(liveGame.odds),
      edgePct: gate.rank.edgePct,
      confidence: gate.rank.confidence,
      units: gate.units,
      modelVersion: gate.rank.model,
      modelProbability: gate.rank.probability,
      modelEdge: gate.rank.edgePct,
      postedOdds: gate.lockedOdds,
      selectedOdds: pick.selected_odds ?? gate.lockedOdds,
    },
  );
  if (!result.claimed) {
    return { ok: true, posted: false, pickId, error: "Pick is already posting." };
  }
  if (result.uncertain || (result.sent && result.status !== "posted")) {
    await sql`
      update picks
      set status = 'delivery_unknown', skip_reason = ${"DELIVERY_UNKNOWN"},
          posting_at = null, posting_started_at = null, posting_token = null
      where id = ${pick.id} and status = 'posting' and discord_message_id is null
    `;
    await recordEvent("delivery_unknown");
    await addLog("post", `Discord send uncertain, not retried · ${gate.selection}`, pick.sport);
    await alertOwner("DISCORD_FAIL", result.error ?? "timeout after send");
    return { ok: false, posted: false, pickId, error: result.error };
  }
  if (!result.sent) {
    await recordEvent("discord_failure");
    await addLog("post", `Discord failed, still queued: ${result.error ?? "send failed"}`, pick.sport);
    await alertOwner("DISCORD_FAIL", result.error ?? "send failed");
    return { ok: false, posted: false, pickId, error: result.error };
  }
  await recordEvent(paper ? "paper_post" : "discord_picks_success");
  await addLog("post", `${paper ? "PAPER lock" : "Discord confirmed"} ${gate.selection} · ${pick.matchup} · ${gate.rank.model}`, pick.sport);
  if (!paper) await recordPostedPrediction(liveGame, gate.rank);
  return { ok: true, posted: true, pickId };
}

export async function prefetchDueDraftKings(games: GameCard[], minEdge: number, minConf: number, lead: number, maxDailyPicks = 3): Promise<GameCard[]> {
  const next = new Map(games.map(g => [g.id, g]));
  const slate = selectSlatePicks(games, minEdge, minConf, dailyPickTarget(maxDailyPicks));
  for (const { game, tier } of slate) {
    if (Date.parse(game.startAt) - Date.now() > lead * 60_000 || !game.rank) continue;
    const softFloor = tier === "soft_floor";
    const verified = await confirmDraftKings(game, game.rank.market);
    if (verified.ok) {
      const ranked = rankGame(verified.game);
      const checked = prePostTruthCheck({ queued: {
        gameId: game.id, league: game.league, homeName: game.home.name, awayName: game.away.name,
        startAt: game.startAt, market: game.rank.market, softFloor, pickTier: softFloor ? "soft_floor" : "lock",
      }, live: verified.game, rank: ranked ? { ...ranked, pickTier: softFloor ? "soft_floor" : "lock" } : null, minEdge, minConf, softFloor });
      // Soft-floor: never poison the priced ticket with a hard PASS before selectOfficialCard.
      // Hard locks still stamp passReason so they fall through to soft floor when appropriate.
      let nextRank = checked.ok ? checked.rank : ranked ? { ...ranked, passReason: checked.reason } : null;
      if (!checked.ok && softFloor && game.rank) {
        nextRank = { ...game.rank, pickTier: "soft_floor" };
      }
      const fresh = { ...verified.game, rank: nextRank };
      verifiedThisTick.set(fresh, Date.now());
      next.set(game.id, fresh);
    } else if (softFloor && game.rank) {
      // Keep soft-floor selection alive; post path re-verifies DK.
      next.set(game.id, { ...game, rank: { ...game.rank, pickTier: "soft_floor" } });
      await recordEvent(verified.error.includes("AMBIGUOUS") ? "ambiguous_match" : "dk_failure", verified.error);
    } else {
      next.set(game.id, { ...game, rank: game.rank ? { ...game.rank, passReason: "PASS_DK_UNAVAILABLE" } : null });
      await recordEvent(verified.error.includes("AMBIGUOUS") ? "ambiguous_match" : "dk_failure", verified.error);
    }
  }
  return [...next.values()];
}

export async function flushDuePosts(games: GameCard[], minEdge: number, minConf: number, workerToken: string): Promise<number> {
  const sql = await getSql();
  const due = await sql<{ id: number }>`
    select id from picks
    where status = 'queued' and coalesce(pick_source, 'auto') = 'auto' and ledger = ${activeLedger()} and post_at <= now() and start_at > now() order by edge_pct desc, id asc
  `;
  let posted = 0;
  for (const row of due) {
    const result = await postPickById(row.id, games, minEdge, minConf, { workerToken });
    if (result.posted && result.pickId === row.id) posted += 1;
  }
  return posted;
}

export async function selectOfficialCard(
  games: GameCard[],
  minEdge: number,
  minConf: number,
  leadMinutes: number,
  _allowResearch: boolean,
  maxDailyPicks = 3,
): Promise<number> {
  const target = dailyPickTarget(maxDailyPicks);
  const slate = selectSlatePicks(games, minEdge, minConf, target);
  const tierById = new Map(slate.map((s) => [s.game.id, s.tier]));
  const ranked = slate.map((s) => s.game);
  const committed = await loadTodayOfficial();
  const plan = planDailyCard(
    ranked.map((g) => g.id),
    committed.map((p) => ({ gameId: p.gameId, status: p.status, startAt: p.startAt })),
    target,
  );
  const wantedIdSet = new Set(plan.keepIds);
  const wanted = ranked.filter((g) => wantedIdSet.has(g.id));

  const sql = await getSql();
  for (const gameId of plan.rotateOffIds) {
    const row = committed.find((p) => p.gameId === gameId && p.status === "queued");
    if (!row) continue;
    await sql`
      update picks
      set status = 'skipped', skip_reason = ${ROTATE_SKIP_REASON}
      where id = ${row.id} and status = 'queued' and freeze_json is null
    `;
    await addLog("skip", `${row.selection} — ${ROTATE_SKIP_REASON}`, row.sport);
  }

  if (plan.keepIds.length === 0 && plan.remaining > 0) {
    await addLog("skip", `PASS: no lock or soft-floor candidates on live slate (target ${target}).`);
  } else if (wanted.some((g) => tierById.get(g.id) === "soft_floor")) {
    const softN = wanted.filter((g) => tierById.get(g.id) === "soft_floor").length;
    const lockN = wanted.length - softN;
    await addLog("research", `Card mix · ${lockN} LOCK · ${softN} BEST AVAILABLE / DESK PICK (target ${target}).`);
  }

  const existingByGame = await loadLatestPicksByGames(wanted.map((g) => g.id));

  let queued = 0;
  for (const game of wanted) {
    const rank = game.rank;
    if (!rank) continue;
    if (game.status !== "scheduled") continue;
    const existing = existingByGame.get(game.id) ?? null;
    if (existing && (existing.status === "posted" || existing.status === "graded" || existing.status === "posting")) continue;

    const tier = tierById.get(game.id) ?? rank.pickTier ?? "lock";
    const reason = formatWhy(game, rank).trim().slice(0, 1000);
    const confidence = Math.round(rank.confidence);
    const units = unitsForTier(tier === "soft_floor" ? "soft_floor" : "lock");
    const postAt = queuePostAt(tier, game.startAt, leadMinutes);
    const matchup = `${game.away.abbr} @ ${game.home.abbr}`;
    const key = officialKey(game.league, game.id);
    const snapshot = JSON.stringify(game.odds);
    const contextJson = JSON.stringify({
      espnId: game.espnId,
      homeName: game.home.name,
      awayName: game.away.name,
      homeStarter: game.home.starter?.name ?? null,
      awayStarter: game.away.starter?.name ?? null,
      startAt: game.startAt,
      pickTier: tier,
      softFloor: tier === "soft_floor",
    });
    if (existing && (existing.status === "queued" || existing.status === "skipped") && !existing.freezeJson) {
      await sql`
        update picks set
          status = 'queued',
          skip_reason = null,
          game_id = ${game.id},
          league = ${game.league},
          matchup = ${matchup},
          market = ${rank.market},
          selection = ${rank.selection},
          side = ${rank.side},
          locked_line = ${rank.line},
          locked_odds = ${rank.price},
          locked_odds_json = ${snapshot},
          reason = ${reason},
          research = ${null},
          confidence = ${confidence},
          edge_pct = ${rank.edgePct},
          units = ${units},
          model_version = ${rank.model},
          model_probability = ${rank.probability},
          model_edge = ${rank.edgePct},
          start_at = ${game.startAt},
          post_at = ${postAt},
          official_key = ${key},
          ledger = ${activeLedger()},
          context_json = ${contextJson}
        where id = ${existing.id} and status in ('queued','skipped') and freeze_json is null
      `;
    } else {
      try {
        await sql`
          insert into picks (
            game_id, sport, league, matchup, market, selection, side,
            locked_line, locked_odds, locked_odds_json, reason, research,
            confidence, edge_pct, units, status, start_at, post_at, official_key,
            model_version, model_probability, model_edge, selected_odds, selected_at, ledger, context_json
          ) values (
            ${game.id}, ${game.sport}, ${game.league}, ${matchup}, ${rank.market}, ${rank.selection}, ${rank.side},
            ${rank.line}, ${rank.price}, ${snapshot}, ${reason}, ${null},
            ${confidence}, ${rank.edgePct}, ${units}, 'queued', ${game.startAt}, ${postAt}, ${key},
            ${rank.model}, ${rank.probability}, ${rank.edgePct}, ${rank.price}, now(), ${activeLedger()}, ${contextJson}
          )
        `;
      } catch {
        await addLog("skip", `${game.sport}: live ticket already exists.`, game.sport);
        continue;
      }
    }
    await addLog("research", `${game.sport} ${rank.selection} queued · posts ${postAt}`, game.sport);
    queued += 1;
  }

  return queued;
}

async function captureClosingQuotes(games: GameCard[]): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{id:number;game_id:string;market:string}>`select id, game_id, market from picks
    where status = 'posted' and result is null and pick_source = 'auto'
      and start_at > now() and start_at <= now() + interval '20 minutes'`;
  for (const row of rows) {
    const game = games.find(g => g.id === row.game_id && g.status === 'scheduled');
    if (!game) continue;
    const verified = await confirmDraftKings(game, row.market as PickRow['market']);
    if (verified.ok) await sql`update picks set closing_snapshot_json = ${JSON.stringify(verified.game.odds)} where id = ${row.id} and status = 'posted'`;
  }
}

export async function runTick(source: string, opts: { research?: boolean } = {}) {
  let locked: string | null = null;
  try {
    locked = await tryWorkerLock();
    if (!locked) return { ok: true as const, skipped: true, source };
    const sql = await getSql();
    const stuck = await sql<{id: number}>`update picks set status = 'delivery_unknown', skip_reason = 'DELIVERY_UNKNOWN'
      where status = 'posting' and posting_started_at < now() - interval '4 minutes' returning id`;
    if (stuck.length) { await recordEvent("delivery_unknown", `${stuck.length} unfinished sends`); await alertOwner("DISCORD_FAIL", "Unfinished delivery: inspect frozen tickets; do not resend."); }
    const meta = await loadMeta();
    const games = await prefetchDueDraftKings(await refreshSlate(), meta.minEdgePct, meta.minConfidence, meta.postLeadMinutes, meta.maxDailyPicks);
    if (automationStatus(meta.lastTickAt) === "offline") {
      await alertOwner("CRON_STALE", "No successful cron tick for more than 25 minutes.");
    }
    if ((meta.oddsRemaining ?? 1) <= 0) await alertOwner("ODDS_CREDITS", "Odds API credits exhausted.");
    const voided = 0;
    await captureClosingQuotes(games);
    const graded = await gradeOpenPicks(games);
    await gradeShadowPredictions(games);
    const research =
      !isFreeBetaMode() &&
      opts.research !== false &&
      (source === "cron" || source === "desk" || source === "boot");
    const queued = await selectOfficialCard(
      games,
      meta.minEdgePct,
      meta.minConfidence,
      meta.postLeadMinutes,
      research,
      meta.maxDailyPicks,
    );
    const posted = await flushDuePosts(games, meta.minEdgePct, meta.minConfidence, locked);
    try { await syncRecordScoreboard(); } catch { await alertOwner("DISCORD_FAIL", "Scoreboard storage/update failed; automatic grading remains active."); }
    try { await sendWeeklyRecap(); } catch { await alertOwner("DISCORD_FAIL", "Weekly recap failed; inspect delivery state before resending."); }
    if (source === "cron") { await touchCronTick(source); await recordEvent("cron_success"); }
    const espn = espnScanStats();
    const espnErrors = espn.espn_error_count
      ? ` · errors ${espn.espn_error_count}${espn.espn_last_error ? ` (${espn.espn_last_error})` : ""}`
      : "";
    await addLog(
      "scan",
      `Tick ${source}: ${games.length} games · espn ${espn.espn_request_count} req · ${espn.scan_duration_ms}ms${espnErrors} · queued ${queued} · posted ${posted} · graded ${graded}`,
    );
    return {
      ok: true as const,
      skipped: false,
      source,
      games: games.length,
      games_loaded: games.length,
      espn_request_count: espn.espn_request_count,
      scan_duration_ms: espn.scan_duration_ms,
      espn_error_count: espn.espn_error_count,
      espn_last_error: espn.espn_last_error,
      queued,
      posted,
      graded,
      voided,
    };
  } catch (error) {
    const code = (error as {code?: string})?.code;
    if (code && (/^[0-9A-Z]{5}$/.test(code) || /ECONN|ETIMEDOUT/.test(code))) {
      console.error(JSON.stringify({kind:"db_failure", source}));
      try { await recordEvent("db_failure", "Database operation failed"); } catch { /* host logs retain outage evidence */ }
    }
    try { await recordEvent(source === "cron" ? "cron_failure" : "run_failure", "Worker failed; review private logs"); } catch { /* DB may be unavailable */ }
    await alertOwner("DB_UNAVAILABLE", "Worker failed. Check database and private runtime logs.");
    throw error;
  } finally {
    if (locked) await clearWorkerLock(locked);
  }
}

export async function readDeskState() {
  return readDesk();
}
