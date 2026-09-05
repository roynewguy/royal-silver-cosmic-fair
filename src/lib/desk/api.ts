import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { buildManualPickMessage, buildOperatorPost, buildTestPreviewMessage, deleteWebhookMessage, discordWebhookOk, postWebhook, resolveWebhook } from "@/lib/sports/discord";
import type { Market, Side } from "@/lib/sports/types";
import { canPostGame, manualFreezeJson, NO_INVENTED_LINE, resolveManualTicket } from "@/lib/sports/manual-post";
import { changePin, cronAuthorized, isOperator, loginWithPin, logoutOperator, pinFromEnv, requireOperator } from "./admin";
import { alertOwner } from "./alerts";
import { postPickById, refreshSlate, runTick, sqlLocker } from "./cycle";
import { sendOnce } from "./post-pipeline";
import { redactDesk } from "./redact";
import { addLog, loadGames, loadMeta, pickFromRow, readDesk, writeDeskSettings, writeMaxDailyPicks, writeWebhook } from "./store";
import { shouldStartInProcessWorker } from "./worker-policy";

const g = globalThis as typeof globalThis & {
  __boatboyzWorker?: ReturnType<typeof setInterval>;
  __boatboyzBoot?: ReturnType<typeof setTimeout>;
};

export function ensureWorkerStarted() {
  if (typeof setInterval === "undefined") return;
  if (!shouldStartInProcessWorker()) return;
  if (g.__boatboyzWorker) return;
  g.__boatboyzWorker = setInterval(() => {
    void runTick("interval", { research: false }).catch((err) => {
      void addLog("scan", `Worker error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, 10 * 60 * 1000);
  g.__boatboyzBoot = setTimeout(() => {
    void runTick("boot", { research: true }).catch((err) => {
      void addLog("scan", `Boot tick failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, 5000);
}

export async function tickDesk(source: string, research = true) {
  ensureWorkerStarted();
  return runTick(source, { research });
}

async function deskForClient() {
  const operator = await isOperator();
  const state = await readDesk({ operator });
  return redactDesk({ ...state, operator, pinFromEnv: pinFromEnv() }, operator);
}

export const getDesk = createServerFn({ method: "GET" }).handler(async () => {
  ensureWorkerStarted();
  return deskForClient();
});

export const refreshBoard = createServerFn({ method: "POST" }).handler(async () => {
  const gate = await requireOperator();
  if (!gate.ok) return Promise.reject(new Error(gate.error));
  await runTick("scan", { research: false });
  return deskForClient();
});

export const runDesk = createServerFn({ method: "POST" }).handler(async () => {
  const gate = await requireOperator();
  if (!gate.ok) return Promise.reject(new Error(gate.error));
  await runTick("desk", { research: true });
  return deskForClient();
});

export const pushPick = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { pickId?: number; webhookUrl?: string; allowLive?: boolean };
    return {
      pickId: Number(data.pickId),
      webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : "",
      allowLive: data.allowLive === true,
    };
  })
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
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
    if (pick.status === "skipped") {
      return { ok: false as const, error: "This pick no longer qualifies. Run the desk again." };
    }
    if (!["queued", "posting", "posted", "graded"].includes(pick.status)) {
      return { ok: false as const, error: `This pick is ${pick.status} and cannot be posted.` };
    }
    if (data.webhookUrl) {
      if (!discordWebhookOk(data.webhookUrl)) return { ok: false as const, error: "Webhook URL is not a Discord webhook." };
      await writeWebhook(data.webhookUrl);
    }
    const resolved = resolveWebhook(data.webhookUrl || (await (await import("./store")).readWebhook()));
    if (!resolved.url) return { ok: false as const, error: "No Discord webhook configured." };
    if (pick.status === "queued" || pick.status === "posting") {
      const meta = await loadMeta();
      const result = await postPickById(
        pick.id,
        await loadGames(),
        meta.minEdgePct,
        meta.minConfidence,
        { ignoreWindow: true, refresh: true, allowLive: data.allowLive },
      );
      if (result.pickId !== pick.id) return { ok: false as const, error: "Wrong pick." };
      if (!result.ok) return { ok: false as const, error: result.error ?? "Post failed." };
      if (!result.posted) return { ok: false as const, error: result.error ?? "Pick was not posted." };
    }
    return { ok: true as const, state: await deskForClient() };
  });

export const postTestPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ gameId: String((input as { gameId?: string }).gameId ?? "") }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    let game = (await loadGames()).find((item) => item.id === data.gameId);
    if (!game) {
      const fresh = await refreshSlate();
      game = fresh.find((item) => item.id === data.gameId);
    }
    if (!game) return { ok: false as const, error: "Game not found on the current slate." };
    if (game.status === "final" || game.status === "cancelled" || game.status === "postponed") {
      return { ok: false as const, error: `This game is ${game.status} and cannot be previewed.` };
    }
    const hook = resolveWebhook(await (await import("./store")).readWebhook()).url;
    if (!hook) return { ok: false as const, error: "No Discord webhook configured." };
    const result = await postWebhook(hook, buildTestPreviewMessage(game));
    if (!result.ok) return { ok: false as const, error: result.error ?? "Test post failed." };
    await addLog("post", `Test preview posted · ${game.sport} ${game.away.abbr} @ ${game.home.abbr}`, game.sport);
    return { ok: true as const, state: await deskForClient() };
  });

export const postManualPick = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as {
      gameId?: string;
      market?: string;
      side?: string;
      selection?: string;
      line?: string;
      odds?: string;
      units?: string | number;
      note?: string;
      requestId?: string;
    };
    return {
      gameId: String(data.gameId ?? ""),
      market: data.market as Market,
      side: data.side as Side,
      selection: typeof data.selection === "string" ? data.selection : "",
      line: typeof data.line === "string" ? data.line : data.line != null ? String(data.line) : "",
      odds: typeof data.odds === "string" ? data.odds : data.odds != null ? String(data.odds) : "",
      units: data.units ?? 1,
      note: typeof data.note === "string" ? data.note : "",
      requestId: String(data.requestId ?? "").trim(),
    };
  })
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const requestId = data.requestId || crypto.randomUUID();
    if (!["spread", "moneyline", "total"].includes(data.market)) {
      return { ok: false as const, error: "Choose a valid market." };
    }
    if (!["home", "away", "over", "under"].includes(data.side)) {
      return { ok: false as const, error: "Choose a valid side." };
    }

    const games = await loadGames();
    let game = games.find((item) => item.id === data.gameId);
    if (!game) {
      const fresh = await refreshSlate();
      game = fresh.find((item) => item.id === data.gameId);
    }
    if (!game) return { ok: false as const, error: "Game not found. Scan odds and try again." };
    if (!canPostGame(game)) {
      return { ok: false as const, error: `This game is ${game.status} and cannot be posted.` };
    }

    let ticket;
    try {
      ticket = resolveManualTicket({
        game,
        market: data.market,
        side: data.side,
        selection: data.selection,
        line: data.line,
        odds: data.odds,
        units: data.units,
        note: data.note,
      });
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : NO_INVENTED_LINE };
    }

    const hook = resolveWebhook(await (await import("./store")).readWebhook()).url;
    if (!hook) return { ok: false as const, error: "No Discord webhook configured." };

    const matchup = `${game.away.name} @ ${game.home.name}`;
    const now = new Date().toISOString();
    const sql = await getSql();
    const existing = await sql<{ id: number; status: string }>`
      select id, status from picks where manual_post_id = ${requestId} limit 1
    `;
    if (existing[0]?.status === "posted") {
      return { ok: true as const, state: await deskForClient(), duplicate: true };
    }
    if (existing[0]?.status === "posting" || existing[0]?.status === "skipped") {
      return { ok: false as const, error: "This pick was already sent or is uncertain — not retried." };
    }

    let id = existing[0]?.id;
    if (!id) {
      try {
        const inserted = await sql<{ id: number }>`
          insert into picks (
            game_id, sport, league, matchup, market, selection, side,
            locked_line, locked_odds, locked_odds_json, reason, research,
            confidence, edge_pct, units, status, start_at, post_at,
            model_version, model_probability, model_edge, selected_odds, selected_at,
            official_key, ledger, pick_source, line_source, posted_score, posted_state,
            needs_manual_grade, manual_post_id
          ) values (
            ${game.id}, ${game.sport}, ${game.league}, ${matchup}, ${data.market}, ${ticket.selection}, ${data.side},
            ${ticket.line}, ${ticket.odds}, ${JSON.stringify(game.odds)}, ${ticket.reason}, null,
            0, 0, ${ticket.units}, 'queued', ${game.startAt}, ${now},
            null, null, null, ${ticket.odds}, ${now},
            null, 'official', ${ticket.pickSource}, ${ticket.lineSource}, ${ticket.postedScore}, ${ticket.postedState},
            ${ticket.needsManualGrade}, ${requestId}
          )
          returning id
        `;
        id = inserted[0]?.id;
      } catch {
        const again = await sql<{ id: number; status: string }>`select id, status from picks where manual_post_id = ${requestId} limit 1`;
        if (again[0]?.status === "posted") return { ok: true as const, state: await deskForClient(), duplicate: true };
        if (again[0]?.status === "posting" || again[0]?.status === "skipped") {
          return { ok: false as const, error: "This pick was already sent or is uncertain — not retried." };
        }
        id = again[0]?.id;
        if (!id) {
          return { ok: false as const, error: "This game already has an open pick." };
        }
      }
    }
    if (!id) return { ok: false as const, error: "Could not create the manual pick." };

    const rows = await sql`select * from picks where id = ${id}`;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "Manual pick was not created." };
    const pick = pickFromRow(row as never);
    const message = buildManualPickMessage(
      { ...pick, postedAt: now, pickSource: ticket.pickSource, lineSource: ticket.lineSource, postedScore: ticket.postedScore, postedState: ticket.postedState, reason: ticket.reason },
      game,
    );
    const result = await sendOnce(id, sqlLocker(sql), () => postWebhook(hook, message), {
      freezeJson: manualFreezeJson({ game, ticket, market: data.market, side: data.side }),
      discordMessage: message,
      selection: ticket.selection,
      market: data.market,
      side: data.side,
      lockedOdds: ticket.odds,
      lockedLine: ticket.line,
      lockedOddsJson: JSON.stringify(game.odds),
      edgePct: 0,
      confidence: 0,
      units: ticket.units,
      modelVersion: null,
      modelProbability: null,
      modelEdge: null,
      postedOdds: ticket.odds,
      selectedOdds: ticket.odds,
    });
    if (!result.claimed) {
      if (result.status === "posted") return { ok: true as const, state: await deskForClient(), duplicate: true };
      return { ok: false as const, error: "This pick is already posting to Discord." };
    }
    if (result.uncertain || (result.sent && result.status !== "posted")) {
      await sql`
        update picks
        set status = 'skipped', skip_reason = ${"Discord send uncertain — not retried."},
            posting_at = null, posting_started_at = null, posting_token = null
        where id = ${id} and status = 'posting' and discord_message_id is null
      `;
      await addLog("post", `Discord send uncertain, not retried · ${ticket.selection}`, game.sport);
      void alertOwner("DISCORD_FAIL", result.error ?? "timeout after send");
      return { ok: false as const, error: result.error ?? "Discord send uncertain — not retried." };
    }
    if (!result.sent) {
      await addLog("post", `Discord failed, still queued: ${result.error ?? "send failed"}`, game.sport);
      void alertOwner("DISCORD_FAIL", result.error ?? "send failed");
      return { ok: false as const, error: result.error ?? "Discord post failed." };
    }
    await addLog("post", `Posted · ${ticket.selection} · ${game.sport}`, game.sport);
    return { ok: true as const, state: await deskForClient() };
  });

export const sendDiscordNote = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({
    message: typeof (input as { message?: string }).message === "string" ? (input as { message: string }).message : "",
  }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const message = buildOperatorPost(data.message);
    if (!message) return { ok: false as const, error: "Type a message first." };
    const hook = resolveWebhook(await (await import("./store")).readWebhook()).url;
    if (!hook) return { ok: false as const, error: "No Discord webhook configured." };
    const sent = await postWebhook(hook, message);
    if (!sent.ok) return { ok: false as const, error: sent.error ?? "Discord post failed." };
    await addLog("post", `Operator Discord post sent (${message.length} chars).`);
    return { ok: true as const, state: await deskForClient() };
  });

export const deleteDiscordPost = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ pickId: Number((input as { pickId?: number }).pickId) }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const sql = await getSql();
    const rows = await sql<{ id: number; sport: string; selection: string; discord_message_id: string | null }>`
      select id, sport, selection, discord_message_id from picks where id = ${data.pickId} and status = 'posted'
    `;
    const pick = rows[0];
    if (!pick) return { ok: false as const, error: "Posted pick not found." };
    if (!pick.discord_message_id) return { ok: false as const, error: "This pick has no Discord message to delete." };
    const resolved = resolveWebhook(await (await import("./store")).readWebhook());
    if (!resolved.url) return { ok: false as const, error: "No Discord webhook configured." };
    const result = await deleteWebhookMessage(resolved.url, pick.discord_message_id);
    if (!result.ok) return { ok: false as const, error: result.error ?? "Discord delete failed." };
    await sql`update picks set discord_message_id = null where id = ${pick.id} and status = 'posted'`;
    await addLog("post", `Discord post deleted · ${pick.selection}`, pick.sport);
    return { ok: true as const, state: await deskForClient() };
  });

export const saveWebhook = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { webhookUrl?: string };
    return { webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : "" };
  })
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    if (process.env.DISCORD_WEBHOOK_URL?.trim()) {
      return { ok: false as const, error: "Webhook is set via DISCORD_WEBHOOK_URL. Leave GitHub out of it." };
    }
    if (data.webhookUrl && !discordWebhookOk(data.webhookUrl)) {
      return { ok: false as const, error: "Webhook URL is not a Discord webhook." };
    }
    await writeWebhook(data.webhookUrl);
    await addLog("post", data.webhookUrl ? "Desk webhook saved (server-side)." : "Desk webhook cleared.");
    return { ok: true as const, state: await deskForClient() };
  });

export const unlockDesk = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ pin: String((input as { pin?: string }).pin ?? "") }))
  .handler(async ({ data }) => {
    const res = await loginWithPin(data.pin);
    if (!res.ok) return res;
    return { ok: true as const, state: await deskForClient() };
  });

export const lockDesk = createServerFn({ method: "POST" }).handler(async () => {
  await logoutOperator();
  return deskForClient();
});

export const saveDailyPicks = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ count: Number((input as { count?: number }).count) }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const count = await writeMaxDailyPicks(data.count);
    await addLog("desk", `Daily card set to ${count} play${count === 1 ? "" : "s"}.`);
    return { ok: true as const, state: await deskForClient() };
  });

export const saveDeskSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { minEdgePct?: number; minConfidence?: number; postLeadMinutes?: number };
    return {
      minEdgePct: Number(data.minEdgePct),
      minConfidence: Number(data.minConfidence),
      postLeadMinutes: Number(data.postLeadMinutes),
    };
  })
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    await writeDeskSettings(data);
    await addLog("desk", "Automation settings saved.");
    return { ok: true as const, state: await deskForClient() };
  });

export const rotatePin = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ pin: String((input as { pin?: string }).pin ?? "") }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    if (pinFromEnv()) return { ok: false as const, error: "BOATBOYZ_PIN is set in hosting secrets. Change it there." };
    const res = await changePin(data.pin);
    if (!res.ok) return res;
    await addLog("auth", "Operator PIN rotated");
    return { ok: true as const };
  });

export const replayPaperDay = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ date: String((input as { date?: string }).date ?? "").trim() }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return { ok: false as const, error: "Use YYYY-MM-DD." };
    const { runPaperReplay } = await import("@/lib/sports/replay-store");
    const report = await runPaperReplay(data.date);
    return { ok: true as const, report };
  });

export { cronAuthorized, refreshSlate };
