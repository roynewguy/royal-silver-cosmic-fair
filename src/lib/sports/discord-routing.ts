export type DiscordRole = "picks" | "results" | "alerts" | "test" | "manual";

export function webhookIdentity(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(u.hostname)) return null;
    const match = u.pathname.match(/^\/api\/webhooks\/([^/]+)\/([^/]+)\/?$/);
    return match ? match[1]! : null;
  } catch { return null; }
}

/** Legacy webhook is picks-only. Tests/alerts/results never silently fall back. */
export function channelWebhook(role: DiscordRole, stored = "", env: NodeJS.ProcessEnv = process.env): string {
  const picks = env.DISCORD_PICKS_WEBHOOK?.trim() || env.DISCORD_WEBHOOK_URL?.trim() || stored.trim();
  const results = env.DISCORD_RESULTS_WEBHOOK?.trim() || "";
  const alerts = env.DISCORD_ALERT_WEBHOOK?.trim() || env.OPERATOR_WEBHOOK_URL?.trim() || "";
  const test = env.DISCORD_TEST_WEBHOOK?.trim() || "";
  const manual = env.DISCORD_MANUAL_WEBHOOK?.trim() || test;
  const urls = { picks, results, alerts, test, manual };
  const selected = urls[role];
  const id = webhookIdentity(selected);
  if (!id) return "";
  if (role === "alerts" && [picks, results, test, manual].some(u => webhookIdentity(u) === id)) return "";
  if (role !== "alerts" && webhookIdentity(alerts) === id) return "";
  if (role === "results" && webhookIdentity(picks) === id) return "";
  if (["test", "manual"].includes(role) && webhookIdentity(picks) === id) return "";
  return selected;
}
