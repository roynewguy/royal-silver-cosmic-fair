export type DiscordRole = "picks" | "results" | "alerts" | "test" | "manual" | "record" | "weekly" | "free" | "lab";

export function webhookIdentity(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(u.hostname)) return null;
    const match = u.pathname.match(/^\/api\/webhooks\/([^/]+)\/([^/]+)\/?$/);
    return match ? match[1]! : null;
  } catch { return null; }
}

const CUSTOMER_ROLES: DiscordRole[] = ["picks", "results", "free"];
const OPS_ROLES: DiscordRole[] = ["alerts", "test", "manual", "record", "weekly", "lab"];

/** Legacy webhook is picks-only. Tests/alerts/results/free/lab never silently fall back. */
export function channelWebhook(role: DiscordRole, stored = "", env: NodeJS.ProcessEnv = process.env): string {
  const picks = env.DISCORD_PICKS_WEBHOOK?.trim() || env.DISCORD_WEBHOOK_URL?.trim() || stored.trim();
  const results = env.DISCORD_RESULTS_WEBHOOK?.trim() || "";
  const alerts = env.DISCORD_ALERT_WEBHOOK?.trim() || env.OPERATOR_WEBHOOK_URL?.trim() || "";
  const test = env.DISCORD_TEST_WEBHOOK?.trim() || "";
  const manual = env.DISCORD_MANUAL_WEBHOOK?.trim() || test;
  // The operator's permanent scoreboard shares #results by default.
  const record = env.DISCORD_RECORD_WEBHOOK?.trim() || results;
  const weekly = env.DISCORD_WEEKLY_WEBHOOK?.trim() || "";
  const free = env.DISCORD_FREE_PICKS_WEBHOOK?.trim() || "";
  const lab = env.DISCORD_MODEL_LAB_WEBHOOK?.trim() || "";
  const urls: Record<DiscordRole, string> = { picks, results, alerts, test, manual, record, weekly, free, lab };
  const selected = urls[role];
  const id = webhookIdentity(selected);
  if (!id) return "";
  if (role === "weekly" && [picks, results, alerts, test, manual, record, free, lab].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "weekly" && webhookIdentity(weekly) === id) return "";
  if (role === "free" && [picks, results, alerts, test, manual, record, weekly, lab].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "free" && webhookIdentity(free) === id) return "";
  if (role === "lab" && [picks, results, alerts, test, manual, record, weekly, free].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "lab" && webhookIdentity(lab) === id) return "";
  if (role === "record" && [picks, alerts, test, manual, free, lab].some(u => webhookIdentity(u) === id)) return "";
  if (role === "alerts" && [picks, results, test, manual, record, free, lab].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "alerts" && webhookIdentity(alerts) === id) return "";
  if (role === "results" && webhookIdentity(picks) === id) return "";
  if (role === "results" && [test, manual].some(u => webhookIdentity(u) === id)) return "";
  if (["test", "manual"].includes(role) && [picks, results].some(u => webhookIdentity(u) === id)) return "";
  return selected;
}

/** TEST channel only. Fail closed if it collides with any customer webhook. */
export function resolveTestWebhook(env: NodeJS.ProcessEnv = process.env): { url: string; reason: string | null } {
  const raw = env.DISCORD_TEST_WEBHOOK?.trim() ?? "";
  const url = channelWebhook("test", "", env);
  if (!url) {
    if (!raw) return { url: "", reason: "DISCORD_TEST_WEBHOOK missing" };
    return { url: "", reason: "TEST webhook collides with a customer or ops channel" };
  }
  for (const role of CUSTOMER_ROLES) {
    const other = channelWebhook(role, "", env);
    if (other && webhookIdentity(other) === webhookIdentity(url)) {
      return { url: "", reason: `TEST webhook collides with ${role}` };
    }
  }
  return { url, reason: null };
}

export function webhooksIsolated(env: NodeJS.ProcessEnv = process.env): boolean {
  const picks = channelWebhook("picks", "", env);
  const results = channelWebhook("results", "", env);
  const alerts = channelWebhook("alerts", "", env);
  if (!picks || !results || !alerts) return false;
  const ids = [picks, results, alerts].map(webhookIdentity);
  return new Set(ids).size === ids.length;
}

export { CUSTOMER_ROLES, OPS_ROLES };
