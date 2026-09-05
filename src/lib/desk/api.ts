import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { buildManualPickMessage, buildOperatorPost, buildTestPreviewMessage, deleteWebhookMessage, discordWebhookOk, postWebhook, resolveWebhook } from "@/lib/sports/discord";
import { formatWhy } from "@/lib/sports/why";
import { lineFor, priceFor, selectionLabel } from "@/lib/sports/odds";
import type { Market, Side } from "@/lib/sports/types";
import { changePin, cronAuthorized, isOperator, loginWithPin, logoutOperator, pinFromEnv, requireOperator } from "./admin";
import { postPickById, refreshSlate, runTick } from "./cycle";
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
  const state = await readDesk();
  const operator = await isOperator();
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
    const data = input as { gameId?: string; market?: string; side?: string };
    const market = data.market as Market;
    const side = data.side as Side;
    return {
      gameId: String(data.gameId ?? ""),
      market,
      side,
    };
  })
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
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
    if (game.status === "final" || game.status === "cancelled" || game.status === "postponed") {
      return { ok: false as const, error: `This game is ${game.status} and cannot be posted.` };
    }
    const price = priceFor(game.odds, data.market, data.side);
    const line = lineFor(game.odds, data.market, data.side);
    if (price == null || !Number.isFinite(price) || (data.market !== "moneyline" && (line == null || !Number.isFinite(line)))) {
      return { ok: false as const, error: "That market does not have a current line." };
    }

    const hook = resolveWebhook(await (await import("./store")).readWebhook()).url;
    if (!hook) return { ok: false as const, error: "No Discord webhook configured." };

    const selection = selectionLabel({
      market: data.market,
      side: data.side,
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
      line,
      price,
    });
    const matchup = `${game.away.name} @ ${game.home.name}`;
    const reason = formatWhy(game, {
      side: data.side,
      market: data.market,
      why: "Selected from the current available line on the BoatBoyz desk.",
    });
    const now = new Date().toISOString();
    const sql = await getSql();
    const inserted = await sql<{ id: number }>`
      insert into picks (
        game_id, sport, league, matchup, market, selection, side,
        locked_line, locked_odds, locked_odds_json, reason, research,
        confidence, edge_pct, units, status, start_at, post_at,
        model_version, model_probability, model_edge, selected_odds, selected_at
      ) values (
        ${game.id}, ${game.sport}, ${game.league}, ${matchup}, ${data.market}, ${selection}, ${data.side},
        ${line}, ${price}, ${JSON.stringify(game.odds)}, ${reason}, null,
        0, 0, 1, 'queued', ${game.startAt}, ${now},
        'manual', null, 0, ${price}, ${now}
      )
      returning id
    `;
    const id = inserted[0]?.id;
    if (!id) return { ok: false as const, error: "Could not create the manual pick." };

    const rows = await sql`select * from picks where id = ${id}`;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "Manual pick was not created." };
    const pick = pickFromRow(row as never);
    const message = buildManualPickMessage(pick, game);
    const sent = await postWebhook(hook, message);
    if (!sent.ok) {
      await sql`update picks set status = 'skipped', skip_reason = ${sent.error ?? "Discord post failed."} where id = ${id}`;
      return { ok: false as const, error: sent.error ?? "Discord post failed." };
    }
    await sql`
      update picks set
        status = 'posted', posted_at = now(), posted_odds = ${price},
        discord_message = ${message}, discord_message_id = ${sent.id ?? null}
      where id = ${id}
    `;
    await addLog("post", `Manual pick posted · ${selection} · ${game.sport}`, game.sport);
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

export { cronAuthorized, refreshSlate };
