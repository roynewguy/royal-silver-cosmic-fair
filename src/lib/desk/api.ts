import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { discordWebhookOk, postWebhook, resolveWebhook } from "@/lib/sports/discord";
import { changePin, cronAuthorized, isOperator, loginWithPin, logoutOperator, requireOperator } from "./admin";
import { flushDuePosts, refreshSlate, runTick } from "./cycle";
import { addLog, loadGames, loadMeta, readDesk, writeWebhook } from "./store";

const g = globalThis as typeof globalThis & {
  __boatboyzWorker?: ReturnType<typeof setInterval>;
  __boatboyzBoot?: ReturnType<typeof setTimeout>;
};

export function ensureWorkerStarted() {
  if (typeof setInterval === "undefined") return;
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
  return { ...state, operator: await isOperator() };
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
    const data = input as { pickId?: number; webhookUrl?: string };
    return {
      pickId: Number(data.pickId),
      webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : "",
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
    if (data.webhookUrl) {
      if (!discordWebhookOk(data.webhookUrl)) return { ok: false as const, error: "Webhook URL is not a Discord webhook." };
      await writeWebhook(data.webhookUrl);
    }
    const resolved = resolveWebhook(data.webhookUrl || (await (await import("./store")).readWebhook()));
    if (!resolved.url) return { ok: false as const, error: "No Discord webhook configured." };
    if (pick.status === "queued") {
      const meta = await loadMeta();
      const posted = await flushDuePosts(await loadGames(), meta.minEdgePct, meta.minConfidence);
      if (posted > 0) return { ok: true as const, state: await deskForClient() };
      const content = pick.discord_message ?? `${pick.sport} · ${pick.selection}\n${pick.matchup}`;
      const sent = await postWebhook(resolved.url, content);
      if (!sent.ok) return { ok: false as const, error: sent.error ?? "Webhook failed." };
      await sql`
        update picks
        set status = 'posted', posted_at = now(), discord_message = ${content}, discord_message_id = ${sent.id ?? null}
        where id = ${pick.id} and status = 'queued'
      `;
      await addLog("post", `Discord confirmed ${pick.selection} · ${pick.matchup}`, pick.sport);
    }
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

export const rotatePin = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ pin: String((input as { pin?: string }).pin ?? "") }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const res = await changePin(data.pin);
    if (!res.ok) return res;
    await addLog("auth", "Operator PIN rotated");
    return { ok: true as const };
  });

export { cronAuthorized, refreshSlate };
