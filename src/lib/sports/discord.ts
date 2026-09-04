import { formatAmerican, formatKick, formatLine } from "@/lib/utils";
import type { GameCard, PickRow } from "./types";

export function buildDiscordMessage(pick: PickRow, game?: GameCard | null): string {
  const lineBits: string[] = [];
  const odds = pick.lockedOddsJson;
  if (odds.homeSpread != null) {
    lineBits.push(`${game?.home.abbr ?? "HOME"} ${formatLine(odds.homeSpread)}`);
  }
  if (odds.total != null) lineBits.push(`O/U ${odds.total}`);
  if (odds.homeMl != null && odds.awayMl != null) {
    lineBits.push(`ML ${formatAmerican(odds.homeMl)} / ${formatAmerican(odds.awayMl)}`);
  }
  const locked = lineBits.length ? lineBits.join(" · ") : `${pick.selection}`;
  const kick = formatKick(pick.startAt);
  return [
    `**${pick.sport} · BEST PLAY**`,
    pick.selection,
    `${pick.matchup} · ${kick}`,
    `Locked at post: ${locked} (${odds.book ?? "book"})`,
    "",
    pick.reason,
    "",
    `_Confidence ${pick.confidence} · ${pick.units}u_`,
  ].join("\n");
}

export function discordWebhookOk(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host !== "discord.com" && host !== "discordapp.com") return false;
    return u.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

export async function postWebhook(url: string, content: string): Promise<{ ok: boolean; error?: string }> {
  if (!discordWebhookOk(url)) return { ok: false, error: "Webhook URL is not a Discord webhook." };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Boat Boyz Picks",
      content: content.slice(0, 1800),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Discord ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}` };
  }
  return { ok: true };
}
