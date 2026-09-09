export type DiscordRole = "picks" | "results" | "alerts" | "test" | "manual" | "record" | "weekly" | "free";

export function webhookIdentity(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(u.hostname)) return null;
    const match = u.pathname.match(/^\/api\/webhooks\/([^/]+)\/([^/]+)\/?$/);
    return match ? match[1]! : null;
  } catch { return null; }
}

/** Legacy webhook is picks-only. Tests/alerts/results/free never silently fall back. */
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
  const urls = { picks, results, alerts, test, manual, record, weekly, free };
  const selected = urls[role];
  const id = webhookIdentity(selected);
  if (!id) return "";
  if (role === "weekly" && [picks, results, alerts, test, manual, record, free].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "weekly" && webhookIdentity(weekly) === id) return "";
  if (role === "free" && [picks, results, alerts, test, manual, record, weekly].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "free" && webhookIdentity(free) === id) return "";
  if (role === "record" && [picks, alerts, test, manual, free].some(u => webhookIdentity(u) === id)) return "";
  if (role === "alerts" && [picks, results, test, manual, record, free].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "alerts" && webhookIdentity(alerts) === id) return "";
  if (role === "results" && webhookIdentity(picks) === id) return "";
  if (["test", "manual"].includes(role) && webhookIdentity(picks) === id) return "";
  return selected;
}
