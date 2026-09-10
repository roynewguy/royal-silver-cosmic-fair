import { channelWebhook } from "../sports/discord-routing.ts";
import { postWebhook, buildOwnerAlertPayload } from "../sports/discord.ts";

export type AlertCode =
  | "CRON_STALE"
  | "ESPN_FAIL"
  | "ESPN_FAILURE"
  | "DK_UNAVAILABLE"
  | "DISCORD_FAIL"
  | "DISCORD_401"
  | "DISCORD_403"
  | "DISCORD_DELIVERY_UNKNOWN"
  | "DB_UNAVAILABLE"
  | "DATABASE_ERROR"
  | "GRADE_STUCK"
  | "GRADING_BACKLOG"
  | "AMBIGUOUS_MATCH"
  | "ODDS_CREDITS"
  | "ODDS_API_ERROR"
  | "ODDS_QUOTA_LOW"
  | "ODDS_QUOTA_EXHAUSTED"
  | "DATA_CONFLICT"
  | "MARKET_FEED_STALE"
  | "INJURY_FEED_STALE"
  | "MIGRATION_ERROR"
  | "MODEL_DATA_FAILURE";

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 30 * 60_000;

export function resolveAlertWebhook(env: NodeJS.ProcessEnv = process.env): string {
  return channelWebhook("alerts", "", env);
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

export function discordAlertCode(result: { authFailure?: boolean; uncertain?: boolean; error?: string }): AlertCode {
  if (result.authFailure) {
    if (result.error?.includes("401")) return "DISCORD_401";
    if (result.error?.includes("403")) return "DISCORD_403";
    return "DISCORD_FAIL";
  }
  if (result.uncertain) return "DISCORD_DELIVERY_UNKNOWN";
  return "DISCORD_FAIL";
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
  if (!url) return;
  const result = await postWebhook(url, buildOwnerAlertPayload(code, detail));
  try {
    const { recordEvent } = await import("./telemetry.ts");
    await recordEvent(result.ok ? "discord_alerts_success" : "discord_failure", result.ok ? "" : "Private alert failed");
  } catch { /* Alerts must still work when the database fails. */ }
}

export function bumpTruth(counters: Record<string, number>, key: string): Record<string, number> {
  return { ...counters, [key]: (counters[key] ?? 0) + 1 };
}
