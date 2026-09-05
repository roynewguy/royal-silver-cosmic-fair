import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { discordWebhookOk, resolveWebhook } from "@/lib/sports/discord";
import { changePin, cronAuthorized, isOperator, loginWithPin, logoutOperator, pinFromEnv, requireOperator } from "./admin";
import { postPickById, refreshSlate, runTick } from "./cycle";
import { redactDesk } from "./redact";
import { addLog, loadGames, loadMeta, readDesk, writeMaxDailyPicks, writeWebhook } from "./store";

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
        { ignoreWindow: true, refresh: true },
      );
      if (result.pickId !== pick.id) return { ok: false as const, error: "Wrong pick." };
      if (!result.ok) return { ok: false as const, error: result.error ?? "Post failed." };
      if (!result.posted) return { ok: false as const, error: result.error ?? "Pick was not posted." };
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

export const saveDailyPicks = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ count: Number((input as { count?: number }).count) }))
  .handler(async ({ data }) => {
    const gate = await requireOperator();
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const count = await writeMaxDailyPicks(data.count);
    await addLog("desk", `Daily card set to ${count} play${count === 1 ? "" : "s"}.`);
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
