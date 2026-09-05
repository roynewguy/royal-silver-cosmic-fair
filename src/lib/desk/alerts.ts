import { discordWebhookOk, postWebhook } from "../sports/discord.ts";

export type AlertCode =
  | "CRON_STALE"
  | "ESPN_FAIL"
  | "DK_UNAVAILABLE"
  | "DISCORD_FAIL"
  | "DB_UNAVAILABLE"
  | "GRADE_STUCK"
  | "AMBIGUOUS_MATCH"
  | "ODDS_CREDITS"
  | "DATA_CONFLICT";

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 30 * 60_000;

export function resolveAlertWebhook(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DISCORD_ALERT_WEBHOOK?.trim() || env.OPERATOR_WEBHOOK_URL?.trim() || "";
  if (!discordWebhookOk(url)) return "";
  if (url === env.DISCORD_WEBHOOK_URL?.trim()) return "";
  return url;
}

export function parseAlertMap(raw: unknown): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return parseAlertMap(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return {};
}

export function shouldAlert(
  code: AlertCode,
  now = Date.now(),
  cooldownMs = COOLDOWN_MS,
  store: Map<string, number> = lastSent,
): boolean {
  const prev = store.get(code) ?? 0;
  if (now - prev < cooldownMs) return false;
  store.set(code, now);
  return true;
}

export async function loadAlertMap(): Promise<Record<string, number>> {
  try {
    const { getSql } = await import("../db.ts");
    const sql = await getSql();
    const rows = await sql<{ alert_json: string | null }>`select alert_json from desk_meta where id = 1`;
    return parseAlertMap(rows[0]?.alert_json);
  } catch {
    return {};
  }
}

export async function saveAlertMap(map: Record<string, number>): Promise<void> {
  const { getSql } = await import("../db.ts");
  const sql = await getSql();
  await sql`update desk_meta set alert_json = ${JSON.stringify(map)}, updated_at = now() where id = 1`;
}

export function formatOwnerAlert(code: AlertCode, detail: string): string {
  return `CRITICAL ${code}\n${detail}\nOperator only — not a customer pick.`;
}

export async function alertOwner(code: AlertCode, detail: string): Promise<void> {
  const persisted = await loadAlertMap();
  for (const [k, v] of Object.entries(persisted)) {
    const cur = lastSent.get(k) ?? 0;
    if (v > cur) lastSent.set(k, v);
  }
  if (!shouldAlert(code)) return;
  try {
    await saveAlertMap({ ...persisted, ...Object.fromEntries(lastSent) });
  } catch {
    /* this instance still throttles in memory */
  }
  const url = resolveAlertWebhook();
  const text = formatOwnerAlert(code, detail);
  if (!url) return;
  await postWebhook(url, text);
}

export function bumpTruth(counters: Record<string, number>, key: string): Record<string, number> {
  return { ...counters, [key]: (counters[key] ?? 0) + 1 };
}
