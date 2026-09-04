import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { fetchAllSlates, inWindow } from "@/lib/sports/espn";
import { LEAGUE_BY_ID } from "@/lib/sports/leagues";
import { bestPerSport, rankGames, unitsFor } from "@/lib/sports/rank";
import { gradePick, settle } from "@/lib/sports/grade";
import { discordWebhookOk, buildDiscordMessage, postWebhook } from "@/lib/sports/discord";
import { researchPlays } from "@/lib/sports/research";
import { lineFor, priceFor, selectionLabel } from "@/lib/sports/odds";
import type { GameCard, PickRow } from "@/lib/sports/types";
import {
  addLog,
  livePickForSport,
  loadGames,
  pickByGame,
  readDesk,
  readWebhook,
  touchScan,
  tryWorkerLock,
  clearWorkerLock,
  upsertGames,
  writeWebhook,
} from "./store";

function postAtFor(startAt: string, leadMinutes: number): string {
  const t = new Date(startAt).getTime() - leadMinutes * 60_000;
  return new Date(t).toISOString();
}

async function gradeOpenPicks(games: GameCard[]): Promise<number> {
  const sql = await getSql();
  const open = await sql<{
    id: number;
    game_id: string;
    market: string;
    side: string;
    locked_line: number | null;
    locked_odds: number;
    units: number;
    status: string;
  }>`
    select id, game_id, market, side, locked_line, locked_odds, units, status
    from picks
    where result is null and status in ('queued','posted')
  `;
  const byId = new Map(games.map((g) => [g.id, g]));
  let graded = 0;
  const now = Date.now();
  for (const row of open) {
    const game = byId.get(row.game_id);
    if (!game) continue;
    const start = new Date(game.startAt).getTime();
    if (row.status === "queued" && start <= now) {
      await sql`
        update picks
        set status = 'skipped', skip_reason = 'Game started before the post window.'
        where id = ${row.id}
      `;
      await addLog("skip", "Missed the post window — game already underway.", game.sport);
      continue;
    }
    const fake: PickRow = {
      id: row.id,
      gameId: row.game_id,
      sport: game.sport,
      league: game.league,
      matchup: `${game.away.abbr} @ ${game.home.abbr}`,
      market: row.market as PickRow["market"],
      selection: "",
      side: row.side as PickRow["side"],
      lockedLine: row.locked_line,
      lockedOdds: row.locked_odds,
      lockedOddsJson: game.odds,
      reason: "",
      research: null,
      confidence: 0,
      edgePct: 0,
      units: Number(row.units),
      status: "posted",
      result: null,
      profitUnits: null,
      startAt: game.startAt,
      postAt: game.startAt,
      postedAt: null,
      gradedAt: null,
      discordMessage: null,
      skipReason: null,
      createdAt: new Date().toISOString(),
      homeLogo: null,
      awayLogo: null,
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
      homeScore: game.home.score,
      awayScore: game.away.score,
      gameStatus: game.status,
    };
    const result = gradePick(fake, game);
    if (!result) continue;
    const { profit } = settle(fake, result);
    await sql`
      update picks
      set status = 'graded', result = ${result}, profit_units = ${profit}, graded_at = now()
      where id = ${row.id}
    `;
    await addLog(
      "grade",
      `${fake.matchup} ${result}${profit >= 0 ? ` +${profit.toFixed(2)}u` : ` ${profit.toFixed(2)}u`}`,
      game.sport,
    );
    graded += 1;
  }
  return graded;
}

async function flushDuePosts(games: GameCard[], leadMinutes: number): Promise<number> {
  const sql = await getSql();
  const due = await sql<{ id: number; game_id: string }>`
    select id, game_id from picks
    where status = 'queued' and post_at <= now() and start_at > now()
  `;
  const byId = new Map(games.map((g) => [g.id, g]));
  let posted = 0;
  for (const row of due) {
    const game = byId.get(row.game_id);
    const full = await sql<{
      id: number;
      market: string;
      side: string;
      selection: string;
      reason: string;
      confidence: number;
      units: number;
      sport: string;
      league: string;
      matchup: string;
      start_at: string;
      post_at: string;
      edge_pct: number;
      locked_odds: number;
      locked_line: number | null;
    }>`select * from picks where id = ${row.id}`;
    const pick = full[0];
    if (!pick) continue;
    const odds = game?.odds;
    const market = pick.market as PickRow["market"];
    const side = pick.side as PickRow["side"];
    const lockedOdds = odds ? priceFor(odds, market, side) ?? pick.locked_odds : pick.locked_odds;
    const lockedLine = odds ? lineFor(odds, market, side) : pick.locked_line;
    const selection =
      game && odds
        ? selectionLabel({
            market,
            side,
            homeAbbr: game.home.abbr,
            awayAbbr: game.away.abbr,
            line: lockedLine,
            price: lockedOdds,
          })
        : pick.selection;
    const asRow: PickRow = {
      id: pick.id,
      gameId: row.game_id,
      sport: pick.sport,
      league: pick.league,
      matchup: pick.matchup,
      market,
      selection,
      side,
      lockedLine,
      lockedOdds,
      lockedOddsJson: odds ?? { book: "—", details: null, homeMl: null, awayMl: null, homeSpread: null, awaySpread: null, homeSpreadOdds: null, awaySpreadOdds: null, total: null, overOdds: null, underOdds: null, openHomeSpread: null, openTotal: null, openHomeMl: null },
      reason: pick.reason,
      research: null,
      confidence: pick.confidence,
      edgePct: pick.edge_pct,
      units: pick.units,
      status: "posted",
      result: null,
      profitUnits: null,
      startAt: String(pick.start_at),
      postAt: String(pick.post_at),
      postedAt: new Date().toISOString(),
      gradedAt: null,
      discordMessage: null,
      skipReason: null,
      createdAt: new Date().toISOString(),
      homeLogo: game?.home.logo ?? null,
      awayLogo: game?.away.logo ?? null,
      homeAbbr: game?.home.abbr ?? null,
      awayAbbr: game?.away.abbr ?? null,
      homeScore: null,
      awayScore: null,
      gameStatus: game?.status ?? "scheduled",
    };
    const message = buildDiscordMessage(asRow, game);
    const webhook = await readWebhook();
    let discordOk = true;
    if (webhook) {
      const sent = await postWebhook(webhook, message);
      if (!sent.ok) {
        discordOk = false;
        await addLog("post", `Discord failed: ${sent.error ?? "webhook error"}`, pick.sport);
      }
    }
    await sql`
      update picks set
        status = 'posted',
        posted_at = now(),
        selection = ${selection},
        locked_odds = ${lockedOdds},
        locked_line = ${lockedLine},
        locked_odds_json = ${JSON.stringify(asRow.lockedOddsJson)},
        discord_message = ${message}
      where id = ${pick.id}
    `;
    await addLog(
      "post",
      webhook && discordOk
        ? `Posted to Discord · ${selection} · ${pick.matchup}`
        : webhook
          ? `Line frozen, Discord retry needed · ${selection}`
          : `Posted (no webhook saved) · ${selection} · ${pick.matchup}`,
      pick.sport,
    );
    posted += 1;
    void leadMinutes;
  }
  return posted;
}

async function refreshInternal(): Promise<GameCard[]> {
  const raw = await fetchAllSlates();
  const windowed = raw.filter((g) => {
    const days = LEAGUE_BY_ID[g.league]?.lookAheadDays ?? 3;
    return inWindow(g, days);
  });
  const ranked = rankGames(windowed);
  await upsertGames(ranked);
  const sql = await getSql();
  await sql`delete from games where start_at < now() - interval '14 days'`;
  await touchScan("scan");
  const games = await loadGames();
  const meta = await (await import("./store")).loadMeta();
  await flushDuePosts(games, meta.postLeadMinutes);
  await gradeOpenPicks(games);
  await addLog("scan", `Scanned ${ranked.length} games across the board.`);
  return games;
}

export const getDesk = createServerFn({ method: "GET" }).handler(async () => {
  ensureWorkerStarted();
  return readDesk();
});

export const refreshBoard = createServerFn({ method: "POST" }).handler(async () => {
  try {
    await refreshInternal();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    await addLog("scan", `Scan error: ${message}`);
    throw err;
  }
  return readDesk();
});

export const runDesk = createServerFn({ method: "POST" }).handler(async () => {
  const games = await refreshInternal();
  const meta = await (await import("./store")).loadMeta();
  const decisions = bestPerSport(games, meta.minEdgePct, meta.minConfidence);
  const candidates = decisions.filter((d) => !d.skip.skipped && d.pick.rank).map((d) => d.pick);
  const ai = candidates.length ? await researchPlays(candidates) : null;
  const sql = await getSql();

  for (const decision of decisions) {
    if (decision.skip.skipped) {
      await addLog("skip", `${decision.skip.sport}: ${decision.skip.skipReason}`, decision.skip.sport);
      const liveSkip = await livePickForSport(decision.skip.sport);
      if (liveSkip && liveSkip.status === "queued") {
        await sql`
          update picks
          set status = 'skipped', skip_reason = ${decision.skip.skipReason ?? "No strong play."}
          where id = ${liveSkip.id}
        `;
      }
      continue;
    }
    const game = decision.pick;
    const rank = game.rank;
    if (!rank) continue;
    const existingGame = await pickByGame(game.id);
    if (existingGame && (existingGame.status === "posted" || existingGame.status === "graded")) {
      continue;
    }
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
    const postAt = postAtFor(game.startAt, meta.postLeadMinutes);
    const matchup = `${game.away.abbr} @ ${game.home.abbr}`;
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
          post_at = ${postAt}
        where id = ${live.id}
      `;
    } else {
      try {
        await sql`
        insert into picks (
          game_id, sport, league, matchup, market, selection, side,
          locked_line, locked_odds, locked_odds_json, reason, research,
          confidence, edge_pct, units, status, start_at, post_at
        ) values (
          ${game.id}, ${game.sport}, ${game.league}, ${matchup}, ${rank.market}, ${rank.selection}, ${rank.side},
          ${rank.line}, ${rank.price}, ${snapshot}, ${reason}, ${ai ? reason : null},
          ${confidence}, ${rank.edgePct}, ${units}, 'queued', ${game.startAt}, ${postAt}
        )
      `;
      } catch {
        await addLog("skip", `${game.sport}: live ticket already exists.`, game.sport);
        continue;
      }
    }
    await addLog("research", `${game.sport} ${rank.selection} queued · posts ${postAt}`, game.sport);
  }

  await touchScan("desk");
  await flushDuePosts(await loadGames(), meta.postLeadMinutes);
  return readDesk();
});

export const pushPick = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { pickId?: number; webhookUrl?: string };
    return {
      pickId: Number(data.pickId),
      webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : "",
    };
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      discord_message: string | null;
      selection: string;
      matchup: string;
      sport: string;
      status: string;
    }>`select id, discord_message, selection, matchup, sport, status from picks where id = ${data.pickId}`;
    const pick = rows[0];
    if (!pick) return { ok: false as const, error: "Pick not found." };
    const content = pick.discord_message ?? `${pick.sport} · ${pick.selection}\n${pick.matchup}`;
    if (pick.status === "queued") {
      await sql`update picks set status = 'posted', posted_at = now(), discord_message = ${content} where id = ${pick.id}`;
      await addLog("post", `Manual post ${pick.selection} · ${pick.matchup}`, pick.sport);
    }
    if (data.webhookUrl) {
      if (discordWebhookOk(data.webhookUrl)) await writeWebhook(data.webhookUrl);
      const sent = await postWebhook(data.webhookUrl, content);
      if (!sent.ok) return { ok: false as const, error: sent.error ?? "Webhook failed." };
    } else {
      const stored = await readWebhook();
      if (stored) {
        const sent = await postWebhook(stored, content);
        if (!sent.ok) return { ok: false as const, error: sent.error ?? "Webhook failed." };
      }
    }
    return { ok: true as const, state: await readDesk() };
  });

export const saveWebhook = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { webhookUrl?: string };
    return { webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : "" };
  })
  .handler(async ({ data }) => {
    if (data.webhookUrl && !discordWebhookOk(data.webhookUrl)) {
      return { ok: false as const, error: "Webhook URL is not a Discord webhook." };
    }
    await writeWebhook(data.webhookUrl);
    await addLog("post", data.webhookUrl ? "Discord webhook saved on the desk." : "Discord webhook cleared.");
    return { ok: true as const, state: await readDesk() };
  });

const g = globalThis as typeof globalThis & {
  __boatboyzWorker?: ReturnType<typeof setInterval>;
  __boatboyzBoot?: ReturnType<typeof setTimeout>;
};

export function ensureWorkerStarted() {
  if (typeof setInterval === "undefined") return;
  if (g.__boatboyzWorker) return;
  g.__boatboyzWorker = setInterval(() => {
    void tickDesk("interval").catch((err) => {
      void addLog("scan", `Worker error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, 8 * 60 * 1000);
  g.__boatboyzBoot = setTimeout(() => {
    void tickDesk("boot").catch((err) => {
      void addLog("scan", `Boot tick failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, 4000);
}

export async function tickDesk(source: string) {
  const locked = await tryWorkerLock();
  if (!locked) return { ok: true as const, skipped: true, source };
  try {
    const games = await refreshInternal();
    return { ok: true as const, skipped: false, source, games: games.length };
  } finally {
    await clearWorkerLock();
  }
}
