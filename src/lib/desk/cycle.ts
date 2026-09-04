import { getSql } from "@/lib/db";
import { officialKey } from "@/lib/sports/day";
import {
  buildDiscordMessage,
  buildRecapMessage,
  postWebhook,
  resolveWebhook,
} from "@/lib/sports/discord";
import { fetchAllSlates, inWindow } from "@/lib/sports/espn";
import { gradePick, settle } from "@/lib/sports/grade";
import { LEAGUE_BY_ID } from "@/lib/sports/leagues";
import { lineFor, priceFor, selectionLabel } from "@/lib/sports/odds";
import { mergeDraftKingsOdds } from "@/lib/sports/odds-api";
import { bestPerSport, rankGame, rankGames, unitsFor } from "@/lib/sports/rank";
import { researchPlays } from "@/lib/sports/research";
import type { GameCard, PickRow } from "@/lib/sports/types";
import {
  addLog,
  clearWorkerLock,
  livePickForSport,
  loadRecord,
  pickByGame,
  readDesk,
  readWebhook,
  touchScan,
  tryWorkerLock,
  upsertGames,
} from "./store";

function postAtFor(startAt: string, leadMinutes: number): string {
  return new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
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
    homeLogo: null,
    awayLogo: null,
    homeAbbr: null,
    awayAbbr: null,
    homeScore: null,
    awayScore: null,
    gameStatus: null,
    ...partial,
  };
}

export async function refreshSlate(): Promise<GameCard[]> {
  const raw = await fetchAllSlates();
  const merged = await mergeDraftKingsOdds(raw);
  const windowed = merged.filter((g) => {
    const days = LEAGUE_BY_ID[g.league]?.lookAheadDays ?? 3;
    return inWindow(g, days);
  });
  const ranked = rankGames(windowed);
  await upsertGames(ranked);
  const sql = await getSql();
  await sql`delete from games where start_at < now() - interval '14 days'`;
  await touchScan("scan");
  return ranked;
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
    const open = await sql<{ id: number; sport: string; selection: string }>`
      select id, sport, selection from picks
      where game_id = ${game.id} and status in ('queued','posted') and result is null
    `;
    for (const row of open) {
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
  }>`
    select * from picks
    where result is null and status in ('queued','posted')
  `;
  const byId = new Map(games.map((g) => [g.id, g]));
  let graded = 0;
  const hook = await webhookUrl();
  for (const row of open) {
    const game = byId.get(row.game_id);
    if (!game) continue;
    if (row.status === "queued" && new Date(game.startAt).getTime() <= Date.now() && game.status === "scheduled") {
      await sql`
        update picks set status = 'skipped', skip_reason = 'Game started before the post window.'
        where id = ${row.id}
      `;
      await addLog("skip", "Missed the post window — game already underway.", game.sport);
      continue;
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
    });
    const result = gradePick(fake, game);
    if (!result) continue;
    const { profit } = settle(fake, result);
    await sql`
      update picks
      set status = 'graded', result = ${result}, profit_units = ${profit}, graded_at = now()
      where id = ${row.id}
    `;
    const record = await loadRecord();
    await addLog(
      "grade",
      `${fake.matchup} ${result} ${profit >= 0 ? "+" : ""}${profit.toFixed(2)}u`,
      game.sport,
    );
    if (hook && fake.status) {
      const recap = buildRecapMessage({ ...fake, result, profitUnits: profit }, game, result, profit, record);
      const sent = await postWebhook(hook, recap);
      if (!sent.ok) await addLog("post", `Recap failed: ${sent.error}`, game.sport);
    }
    graded += 1;
  }
  return graded;
}

export async function flushDuePosts(games: GameCard[], minEdge: number, minConf: number): Promise<number> {
  const sql = await getSql();
  const due = await sql<{ id: number; game_id: string }>`
    select id, game_id from picks
    where status = 'queued' and post_at <= now() and start_at > now()
  `;
  const byId = new Map(games.map((g) => [g.id, g]));
  const hook = await webhookUrl();
  let posted = 0;
  for (const row of due) {
    const game = byId.get(row.game_id);
    if (!game) continue;
    if (game.status !== "scheduled") {
      await sql`update picks set status = 'skipped', skip_reason = ${`Game ${game.status}.`} where id = ${row.id}`;
      continue;
    }
    const freshRank = rankGame(game);
    if (!freshRank || freshRank.edgePct < minEdge || freshRank.confidence < minConf) {
      await sql`
        update picks
        set status = 'skipped',
            skip_reason = ${`Line moved. Edge ${freshRank?.edgePct.toFixed(1) ?? "n/a"}% no longer clears.`}
        where id = ${row.id}
      `;
      await addLog("skip", `${game.sport} PASS at post time — edge gone.`, game.sport);
      continue;
    }
    const lockedOdds = priceFor(game.odds, freshRank.market, freshRank.side) ?? freshRank.price;
    const lockedLine = lineFor(game.odds, freshRank.market, freshRank.side);
    const selection = selectionLabel({
      market: freshRank.market,
      side: freshRank.side,
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
      line: lockedLine,
      price: lockedOdds,
    });
    const full = await sql<{
      id: number;
      sport: string;
      league: string;
      matchup: string;
      reason: string;
      units: number;
      start_at: string;
      post_at: string;
      created_at: string;
    }>`select * from picks where id = ${row.id}`;
    const pick = full[0];
    if (!pick) continue;
    const asRow = asPickRow({
      id: pick.id,
      gameId: row.game_id,
      sport: pick.sport,
      league: pick.league,
      matchup: pick.matchup,
      market: freshRank.market,
      selection,
      side: freshRank.side,
      lockedLine,
      lockedOdds,
      lockedOddsJson: game.odds,
      reason: pick.reason,
      confidence: freshRank.confidence,
      edgePct: freshRank.edgePct,
      units: Number(pick.units),
      status: "queued",
      startAt: String(pick.start_at),
      postAt: String(pick.post_at),
      createdAt: String(pick.created_at),
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
    });
    const message = buildDiscordMessage(asRow, game);
    if (!hook) {
      await addLog("post", "Due pick waiting — no DISCORD_WEBHOOK_URL.", pick.sport);
      continue;
    }
    const sent = await postWebhook(hook, message);
    if (!sent.ok) {
      await addLog("post", `Discord failed, still queued: ${sent.error}`, pick.sport);
      continue;
    }
    await sql`
      update picks set
        status = 'posted',
        posted_at = now(),
        selection = ${selection},
        market = ${freshRank.market},
        side = ${freshRank.side},
        locked_odds = ${lockedOdds},
        locked_line = ${lockedLine},
        locked_odds_json = ${JSON.stringify(game.odds)},
        edge_pct = ${freshRank.edgePct},
        confidence = ${freshRank.confidence},
        discord_message = ${message},
        discord_message_id = ${sent.id ?? null}
      where id = ${pick.id} and status = 'queued'
    `;
    await addLog("post", `Discord confirmed ${selection} · ${pick.matchup}`, pick.sport);
    posted += 1;
  }
  return posted;
}

export async function selectOfficialCard(
  games: GameCard[],
  minEdge: number,
  minConf: number,
  leadMinutes: number,
  allowResearch: boolean,
): Promise<number> {
  const decisions = bestPerSport(games, minEdge, minConf);
  const candidates = decisions.filter((d) => !d.skip.skipped && d.pick.rank).map((d) => d.pick);
  const ai =
    allowResearch && candidates.length ? await researchPlays(candidates) : null;
  const sql = await getSql();
  let queued = 0;
  for (const decision of decisions) {
    if (decision.skip.skipped) {
      await addLog("skip", `${decision.skip.sport}: ${decision.skip.skipReason}`, decision.skip.sport);
      continue;
    }
    const game = decision.pick;
    const rank = game.rank;
    if (!rank) continue;
    const existing = await pickByGame(game.id);
    if (existing && (existing.status === "posted" || existing.status === "graded")) continue;
    const live = await livePickForSport(game.sport);
    if (live && live.status === "posted") continue;

    const aiPlay = ai?.find((p) => p.gameId === game.id || p.sport === game.sport);
    if (aiPlay?.skip) {
      await addLog("skip", `${game.sport}: ${aiPlay.skipReason ?? "Desk passed."}`, game.sport);
      if (live && live.status === "queued") {
        await sql`update picks set status = 'skipped', skip_reason = ${aiPlay.skipReason ?? "Desk passed."} where id = ${live.id}`;
      }
      continue;
    }
    const reason = (aiPlay?.reason ?? rank.why).trim().slice(0, 420);
    const confidence = Math.round(aiPlay?.confidence ?? rank.confidence);
    const units = unitsFor(confidence);
    const postAt = postAtFor(game.startAt, leadMinutes);
    const matchup = `${game.away.abbr} @ ${game.home.abbr}`;
    const key = officialKey(game.league, game.id);
    const snapshot = JSON.stringify(game.odds);
    if (live && live.status === "queued") {
      await sql`
        update picks set
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
          research = ${ai ? reason : null},
          confidence = ${confidence},
          edge_pct = ${rank.edgePct},
          units = ${units},
          start_at = ${game.startAt},
          post_at = ${postAt},
          official_key = ${key}
        where id = ${live.id}
      `;
    } else {
      try {
        await sql`
          insert into picks (
            game_id, sport, league, matchup, market, selection, side,
            locked_line, locked_odds, locked_odds_json, reason, research,
            confidence, edge_pct, units, status, start_at, post_at, official_key
          ) values (
            ${game.id}, ${game.sport}, ${game.league}, ${matchup}, ${rank.market}, ${rank.selection}, ${rank.side},
            ${rank.line}, ${rank.price}, ${snapshot}, ${reason}, ${ai ? reason : null},
            ${confidence}, ${rank.edgePct}, ${units}, 'queued', ${game.startAt}, ${postAt}, ${key}
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
    const games = await refreshSlate();
    const { loadMeta } = await import("./store");
    const meta = await loadMeta();
    const voided = await voidDeadGames(games);
    const graded = await gradeOpenPicks(games);
    const research = opts.research !== false && (source === "cron" || source === "desk" || source === "boot");
    const queued = await selectOfficialCard(
      games,
      meta.minEdgePct,
      meta.minConfidence,
      meta.postLeadMinutes,
      research,
    );
    const posted = await flushDuePosts(games, meta.minEdgePct, meta.minConfidence);
    await addLog("scan", `Tick ${source}: ${games.length} games · queued ${queued} · posted ${posted} · graded ${graded}`);
    return {
      ok: true as const,
      skipped: false,
      source,
      games: games.length,
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
