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
import { impliedFromAmerican, priceFor } from "@/lib/sports/odds";
import { prePostTruthCheck, gradeTruth, type QueuedContext } from "@/lib/sports/truth-gate";
import { isManualSource, NEEDS_MANUAL_GRADE } from "@/lib/sports/manual-post";
import { alertOwner } from "./alerts";
import { automationStatus } from "./health";
import { isFreeBetaMode, oddsBudget } from "@/lib/sports/free-beta";
import { isPaperLedger, isPaperMode, paperLockMessage, paperSimulateSend, activeLedger } from "@/lib/sports/paper-mode";
import { mergeDraftKingsOdds } from "@/lib/sports/odds-api";
import { bestOnSlate, dailyPickTarget, planDailyCard, rankGame, rankGames, ROTATE_SKIP_REASON, unitsFor } from "@/lib/sports/rank";
import { formatWhy } from "@/lib/sports/why";
import {
  fingerprintResearch,
  loadCachedResearch,
  researchPlays,
  saveCachedResearch,
  shouldRefreshResearch,
  type AiPlay,
} from "@/lib/sports/research";
import { confirmDraftKings, loadOddsRemaining, pruneFreeBetaCaches } from "./dk-verify";
import { recordClosingResult, recordPostedPrediction, recordPregameSnapshots } from "./warehouse";
import { recordV2Candidates } from "@/lib/sports/candidate-log";
import { recordMlbShadow, gradeShadowPredictions } from "@/lib/models-v3/shadow-store";
import { gradeDisposition, UNPOSTED_SKIP } from "./posting";
import { sendOnce, type ClaimStore, type CompletePayload, newPostingToken } from "./post-pipeline";
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

function postAtFor(startAt: string, leadMinutes: number): string {
  return new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
}

function sqlLocker(sql: Awaited<ReturnType<typeof getSql>>): ClaimStore {
  return {
    async claim(id) {
      const token = newPostingToken();
      const rows = await sql<{ posting_token: string }>`
        update picks
        set status = 'posting', posting_started_at = now(), posting_at = now(), posting_token = ${token}
        where id = ${id} and status = 'queued' and freeze_json is null
        returning posting_token
      `;
      return rows[0]?.posting_token ?? null;
    },
    async release(id, token) {
      await sql`
        update picks
        set status = 'queued', posting_started_at = null, posting_at = null, posting_token = null
        where id = ${id} and status = 'posting' and freeze_json is null and posting_token = ${token}
      `;
    },
    async complete(id, token, payload: CompletePayload) {
      const rows = await sql<{ id: number }>`
        update picks set
          status = 'posted',
          posted_at = now(),
          posting_at = null,
          posting_started_at = null,
          posting_token = null,
          selection = ${payload.selection},
          market = ${payload.market},
          side = ${payload.side},
          locked_odds = ${payload.lockedOdds},
          locked_line = ${payload.lockedLine},
          locked_odds_json = ${payload.lockedOddsJson},
          edge_pct = ${payload.edgePct},
          confidence = ${payload.confidence},
          units = ${payload.units},
          model_version = ${payload.modelVersion},
          model_probability = ${payload.modelProbability},
          model_edge = ${payload.modelEdge},
          posted_odds = ${payload.postedOdds},
          selected_odds = ${payload.selectedOdds},
          freeze_json = ${payload.freezeJson},
          discord_message = ${payload.discordMessage},
          discord_message_id = ${payload.discordMessageId}
        where id = ${id} and status = 'posting' and freeze_json is null and posting_token = ${token}
        returning id
      `;
      return rows.length > 0;
    },
    async status(id) {
      const rows = await sql<{ status: string }>`select status from picks where id = ${id}`;
      return (rows[0]?.status as import("@/lib/sports/types").PickStatus) ?? null;
    },
  };
}

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
  await touchScan("scan");
  return next;
}

async function webhookUrl(): Promise<string> {
  const stored = await readWebhook();
  return resolveWebhook(stored).url;
}

export async function voidDeadGames(games: GameCard[]): Promise<number> {
  const sql = await getSql();
  const dead = games.filter((g) =>
    g.status === "postponed" || g.status === "cancelled" || g.status === "suspended",
  );
  let n = 0;
  for (const game of dead) {
    const open = await sql<{ id: number; sport: string; selection: string; status: string }>`
      select id, sport, selection, status from picks
      where game_id = ${game.id} and status in ('queued','posting','posted') and result is null
    `;
    for (const row of open) {
      if (row.status !== "posted") {
        await sql`
          update picks
          set status = 'skipped', skip_reason = ${UNPOSTED_SKIP}
          where id = ${row.id}
        `;
        await addLog("skip", `${row.selection} skipped — ${UNPOSTED_SKIP}`, row.sport);
        n += 1;
        continue;
      }
      await sql`
        update picks
        set status = 'graded', result = 'VOID', profit_units = 0, graded_at = now(),
            skip_reason = ${`Game ${game.status}.`}
        where id = ${row.id}
      `;
      await addLog("grade", `${row.selection} VOID — ${game.status}`, row.sport);
      n += 1;
    }
  }
  return n;
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
  }>`
    select * from picks
    where result is null and status in ('queued','posting','posted')
  `;
  const byId = new Map(games.map((g) => [g.id, g]));
  let graded = 0;
  const hook = await webhookUrl();
  for (const row of open) {
    const game = byId.get(row.game_id);
    if (!game) continue;
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
    if (disp !== "grade" && disp !== "void") continue;
    if (row.status !== "posted") continue;
    if (disp === "grade") {
      const gt = gradeTruth({ status: "posted", gameId: row.game_id, league: row.league }, game);
      if (!gt.ok) {
        if (gt.reason === "PASS_GAME_MISMATCH") void alertOwner("DATA_CONFLICT", gt.detail);
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
    });
    const result = disp === "void" ? "VOID" : gradePick(fake, game);
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
    const closing = priceFor(game.odds, fake.market, fake.side);
    const postedOdds = row.posted_odds ?? row.locked_odds;
    const clv =
      closing != null && postedOdds != null
        ? impliedFromAmerican(closing) - impliedFromAmerican(postedOdds)
        : null;
    await sql`
      update picks
      set status = 'graded', result = ${result}, profit_units = ${profit}, graded_at = now(),
          closing_odds = ${closing}, clv = ${clv}
      where id = ${row.id} and status = 'posted'
    `;
    await recordClosingResult({
      game,
      modelVersion: fake.modelVersion,
      result,
      closingPrice: closing,
      postedPrice: postedOdds,
    });
    const record = await loadRecord();
    await addLog(
      "grade",
      `${fake.matchup} ${result} ${profit >= 0 ? "+" : ""}${profit.toFixed(2)}u`,
      game.sport,
    );
    if (hook && !isPaperLedger(row.ledger)) {
      const recap = buildRecapMessage({ ...fake, result, profitUnits: profit }, game, result, profit, record);
      const sent = await postWebhook(hook, recap);
      if (!sent.ok) await addLog("post", `Recap failed: ${sent.error}`, game.sport);
    }
    graded += 1;
  }
  return graded;
}

export async function postPickById(
  pickId: number,
  games: GameCard[],
  minEdge: number,
  minConf: number,
  opts: { ignoreWindow?: boolean; refresh?: boolean; allowLive?: boolean } = {},
): Promise<{ ok: boolean; posted: boolean; error?: string; pickId: number }> {
  const sql = await getSql();
  if (opts.refresh) {
    games = await refreshSlate();
  }
  await sql`
    update picks set status = 'queued', posting_at = null, posting_started_at = null, posting_token = null
    where id = ${pickId} and status = 'posting' and posted_at is null and freeze_json is null
      and posting_started_at is not null
      and posting_started_at < now() - interval '4 minutes'
  `;
  const windowed = opts.ignoreWindow
    ? await sql<{ id: number; game_id: string; selected_odds: number | null }>`
        select id, game_id, selected_odds from picks where id = ${pickId} and status = 'queued'
      `
    : await sql<{ id: number; game_id: string; selected_odds: number | null }>`
        select id, game_id, selected_odds from picks
        where id = ${pickId} and status = 'queued' and post_at <= now() and start_at > now()
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
  const paper = isPaperLedger(queuedMeta[0]?.ledger) || isPaperMode();
  const verified = await confirmDraftKings(game, queuedMarket);
  if (!verified.ok) {
    await sql`
      update picks set status = 'skipped', skip_reason = ${verified.error}
      where id = ${row.id} and status = 'queued'
    `;
    await addLog("skip", `${game.sport} ${verified.error}`, game.sport);
    void alertOwner("DK_UNAVAILABLE", verified.error);
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
  const gate = prePostTruthCheck({
    queued: {
      gameId: row.game_id,
      league: pick.league,
      homeName: ctx.homeName ?? liveGame.home.name,
      awayName: ctx.awayName ?? liveGame.away.name,
      startAt: String(pick.start_at),
      espnId: ctx.espnId,
      market: queuedMarket,
      homeStarter: ctx.homeStarter ?? null,
      awayStarter: ctx.awayStarter ?? null,
      freezeJson: pick.freeze_json,
      status: pick.status,
    },
    live: liveGame,
    rank: freshRank,
    minEdge,
    minConf,
  });
  if (!gate.ok) {
    await sql`
      update picks set status = 'skipped', skip_reason = ${gate.reason}
      where id = ${row.id} and status = 'queued'
    `;
    await addLog("skip", `${game.sport} ${gate.reason}: ${gate.detail}`, game.sport);
    if (gate.reason === "PASS_DK_STALE" || gate.reason === "PASS_DK_UNAVAILABLE") {
      void alertOwner("DK_UNAVAILABLE", gate.detail);
    }
    if (gate.reason === "PASS_ODDS_EVENT_AMBIGUOUS" || gate.reason === "PASS_DATA_CONFLICT") {
      void alertOwner("AMBIGUOUS_MATCH", gate.detail);
    }
    return { ok: true, posted: false, pickId };
  }

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
    reason: pick.reason,
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
    sqlLocker(sql),
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
  if (!result.sent) {
    await addLog("post", `Discord failed, still queued: ${result.error ?? "send failed"}`, pick.sport);
    void alertOwner("DISCORD_FAIL", result.error ?? "send failed");
    return { ok: false, posted: false, pickId, error: result.error };
  }
  await addLog("post", `${paper ? "PAPER lock" : "Discord confirmed"} ${gate.selection} · ${pick.matchup} · ${gate.rank.model}`, pick.sport);
  if (!paper) await recordPostedPrediction(liveGame, gate.rank);
  return { ok: true, posted: true, pickId };
}

export async function prefetchDueDraftKings(games: GameCard[]): Promise<GameCard[]> {
  if (!isFreeBetaMode()) return games;
  const remaining = await loadOddsRemaining();
  if (oddsBudget(remaining) !== "normal") return games;
  const sql = await getSql();
  const due = await sql<{ game_id: string; market: string }>`
    select game_id, market from picks
    where status = 'queued' and post_at <= now() + interval '20 minutes' and start_at > now()
  `;
  let next = games;
  for (const row of due) {
    const g = next.find((x) => x.id === row.game_id);
    if (!g) continue;
    const verified = await confirmDraftKings(g, row.market as import("@/lib/sports/types").Market);
    if (verified.ok) next = next.map((x) => (x.id === g.id ? verified.game : x));
  }
  return next;
}

export const postQueuedPick = postPickById;

export async function flushDuePosts(games: GameCard[], minEdge: number, minConf: number): Promise<number> {
  const sql = await getSql();
  const due = await sql<{ id: number }>`
    select id from picks
    where status = 'queued' and post_at <= now() and start_at > now()
  `;
  let posted = 0;
  for (const row of due) {
    const result = await postPickById(row.id, games, minEdge, minConf);
    if (result.posted && result.pickId === row.id) posted += 1;
  }
  return posted;
}

export async function selectOfficialCard(
  games: GameCard[],
  minEdge: number,
  minConf: number,
  leadMinutes: number,
  allowResearch: boolean,
  maxDailyPicks = 3,
): Promise<number> {
  const target = dailyPickTarget(maxDailyPicks);
  const ranked = bestOnSlate(games, minEdge, minConf);
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
    await addLog("skip", `PASS: no qualifying bets on today's slate (target ${target}).`);
  }

  const existingByGame = await loadLatestPicksByGames(wanted.map((g) => g.id));

  const aiPlays: AiPlay[] = [];
  if (allowResearch && wanted.length) {
    const need: GameCard[] = [];
    for (const game of wanted) {
      const fp = fingerprintResearch(game);
      const cached = await loadCachedResearch(game.id);
      const hours = (new Date(game.startAt).getTime() - Date.now()) / 3_600_000;
      const refresh = shouldRefreshResearch({
        cachedFingerprint: cached?.fingerprint ?? null,
        currentFingerprint: fp,
        cacheAgeMs: cached?.ageMs ?? 0,
        hoursToKick: hours,
        postLeadHours: leadMinutes / 60,
      });
      if (cached && !refresh) {
        aiPlays.push({
          gameId: game.id,
          skip: cached.skip,
          reason: cached.reason,
          skipReason: cached.skipReason ?? undefined,
        });
        continue;
      }
      need.push(game);
    }
    const fresh = need.length ? await researchPlays(need) : null;
    if (fresh) {
      for (const play of fresh) {
        const game = need.find((g) => g.id === play.gameId);
        if (game) await saveCachedResearch(game.id, fingerprintResearch(game), play);
        aiPlays.push(play);
      }
    }
  }

  let queued = 0;
  for (const game of wanted) {
    const rank = game.rank;
    if (!rank) continue;
    if (game.status !== "scheduled") continue;
    const existing = existingByGame.get(game.id) ?? null;
    if (existing && (existing.status === "posted" || existing.status === "graded" || existing.status === "posting")) continue;

    const aiPlay = aiPlays.find((p) => p.gameId === game.id);
    if (aiPlay?.skip) {
      await addLog("skip", `${game.sport}: ${aiPlay.skipReason ?? "Desk passed."}`, game.sport);
      if (existing && existing.status === "queued") {
        await sql`update picks set status = 'skipped', skip_reason = ${aiPlay.skipReason ?? "Desk passed."} where id = ${existing.id}`;
      }
      continue;
    }
    const reason = (aiPlay?.reason ?? formatWhy(game, rank)).trim().slice(0, 520);
    const confidence = Math.round(rank.confidence);
    const units = unitsFor(confidence);
    const postAt = postAtFor(game.startAt, leadMinutes);
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
          research = ${aiPlay ? reason : null},
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
            ${rank.line}, ${rank.price}, ${snapshot}, ${reason}, ${aiPlay ? reason : null},
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
  await touchScan("desk");
  return queued;
}

export async function runTick(source: string, opts: { research?: boolean } = {}) {
  const locked = await tryWorkerLock();
  if (!locked) return { ok: true as const, skipped: true, source };
  try {
    const games = await prefetchDueDraftKings(await refreshSlate());
    const meta = await loadMeta();
    if (automationStatus(meta.lastTickAt) === "offline") {
      void alertOwner("CRON_STALE", "No successful cron tick for more than 25 minutes.");
    }
    if ((meta.oddsRemaining ?? 1) <= 0) void alertOwner("ODDS_CREDITS", "Odds API credits exhausted.");
    const voided = await voidDeadGames(games);
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
    const posted = await flushDuePosts(games, meta.minEdgePct, meta.minConfidence);
    if (source === "cron") await touchCronTick(source);
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
  } finally {
    await clearWorkerLock();
  }
}

export async function readDeskState() {
  return readDesk();
}
