import { discordWebhookOk, postWebhook } from "@/lib/sports/discord.ts";

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

export function shouldAlert(code: AlertCode, now = Date.now(), cooldownMs = COOLDOWN_MS): boolean {
  const prev = lastSent.get(code) ?? 0;
  if (now - prev < cooldownMs) return false;
  lastSent.set(code, now);
  return true;
}

export function formatOwnerAlert(code: AlertCode, detail: string): string {
  return `CRITICAL ${code}\n${detail}\nOperator only — not a customer pick.`;
}

export async function alertOwner(code: AlertCode, detail: string): Promise<void> {
  if (!shouldAlert(code)) return;
  const url = resolveAlertWebhook();
  const text = formatOwnerAlert(code, detail);
  if (!url) return;
  await postWebhook(url, text);
}

export function bumpTruth(counters: Record<string, number>, key: string): Record<string, number> {
  return { ...counters, [key]: (counters[key] ?? 0) + 1 };
}
