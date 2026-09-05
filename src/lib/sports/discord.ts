import { formatAmerican, formatKick, formatUnits } from "../utils.ts";
import type { DeskRecord, GameCard, PickResult, PickRow } from "./types.ts";

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

export function resolveWebhook(stored?: string | null): { url: string; source: "env" | "desk" | "none" } {
  const env = process.env.DISCORD_WEBHOOK_URL?.trim() ?? "";
  if (discordWebhookOk(env)) return { url: env, source: "env" };
  const desk = stored?.trim() ?? "";
  if (discordWebhookOk(desk)) return { url: desk, source: "desk" };
  return { url: "", source: "none" };
}

function waitUrl(url: string) {
  const u = new URL(url);
  u.searchParams.set("wait", "true");
  return u.toString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function postWebhook(
  url: string,
  content: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!discordWebhookOk(url)) return { ok: false, error: "Webhook URL is not a Discord webhook." };

  let last = "Discord failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(waitUrl(url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          username: "Boat Boyz Picks",
          content: content.slice(0, 1800),
          allowed_mentions: { parse: [] },
          flags: 4,
        }),
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after") ?? "1");
        last = "Discord 429";
        await sleep(Math.min(8_000, Math.max(400, retry * 1000)) * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        last = `Discord ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`;
        if (res.status >= 500) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        return { ok: false, error: last };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, id: body.id };
    } catch (err) {
      last = err instanceof Error ? err.message : "Discord timeout";
      await sleep(400 * 2 ** attempt);
    }
  }
  return { ok: false, error: last };
}

export async function deleteWebhookMessage(
  url: string,
  messageId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!discordWebhookOk(url)) return { ok: false, error: "Webhook URL is not a Discord webhook." };
  if (!messageId) return { ok: false, error: "Discord message ID is missing." };
  try {
    const res = await fetch(`${url}/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok || res.status === 404) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Discord ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Discord delete failed." };
  }
}

export function buildTestPreviewMessage(game: GameCard): string {
  return [
    "🧪 BOATBOYZ TEST PREVIEW — NOT AN OFFICIAL PICK",
    "",
    `${game.sport} · ${game.away.abbr} @ ${game.home.abbr}`,
    `Current odds: ${game.odds.details ?? "No current line available"}`,
    `Game: ${formatKick(game.startAt, "America/Los_Angeles")}`,
    scoreLine(game),
    "This message only verifies the Discord connection and current odds display.",
  ].join("\n");
}

export function buildManualPickMessage(pick: PickRow, game?: GameCard | null): string {
  const book = pick.lockedOddsJson.book || "Current market";
  const line = pick.lockedLine == null ? "" : ` · ${pick.lockedLine > 0 ? `+${pick.lockedLine}` : pick.lockedLine}`;
  return [
    "🌊 BOATBOYZ MANUAL PICK",
    "",
    `${pick.sport} · ${pick.selection}`,
    `Selection mode: Operator choice`,
    `${book} current line: ${formatAmerican(pick.lockedOdds)}${line}`,
    "",
    "Why: Selected from the current available line on the BoatBoyz desk.",
    `Game: ${formatKick(pick.startAt, "America/Los_Angeles")}`,
    scoreLine(game).replace("Score: not started", "Score: Not started"),
    "This is a manually selected play; the line is recorded at posting.",
  ].join("\n");
}

export function scoreLine(game?: GameCard | null): string {
  if (!game) return "Score: —";
  const away = `${game.away.abbr} ${game.away.score ?? "—"}`;
  const home = `${game.home.abbr} ${game.home.score ?? "—"}`;
  if (game.status === "scheduled" || (game.away.score == null && game.home.score == null)) {
    return "Score: not started";
  }
  if (game.status === "in_progress") return `Score: ${away} @ ${home} (LIVE)`;
  if (game.status === "final") return `Final: ${away} @ ${home}`;
  return `Score: ${away} @ ${home}`;
}

export function favoredLine(pick: PickRow): string {
  const p = pick.modelProbability ?? pick.confidence / 100;
  const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  return `BoatBoyz Probability: ${pct}%`;
}

export function currentLine(pick: PickRow): string {
  const book = pick.lockedOddsJson.book || "DraftKings";
  const odds = formatAmerican(pick.lockedOdds);
  const line =
    pick.lockedLine == null || !Number.isFinite(pick.lockedLine)
      ? ""
      : pick.market === "total"
        ? ` · total ${pick.lockedLine}`
        : ` · line ${pick.lockedLine > 0 ? `+${pick.lockedLine}` : pick.lockedLine}`;
  return `${book} ${odds}${line}`;
}

export function sportEmoji(sport: string): string {
  const s = sport.toUpperCase();
  if (s === "NBA" || s === "WNBA" || s === "NCAAB") return "🏀";
  if (s === "NFL" || s === "NCAAF") return "🏈";
  if (s === "MLB") return "⚾";
  if (s === "NHL") return "🏒";
  if (s === "UFC") return "🥊";
  if (s === "MLS" || s === "EPL") return "⚽";
  return "🌊";
}

export function vsLine(pick: PickRow, game?: GameCard | null): string {
  if (pick.side === "home") return `vs ${game?.away.name ?? pick.matchup.split("@")[0]?.trim() ?? "opponent"}`;
  if (pick.side === "away") return `at ${game?.home.name ?? pick.matchup.split("@")[1]?.trim() ?? "opponent"}`;
  return pick.matchup;
}

export function buildDiscordMessage(pick: PickRow, game?: GameCard | null): string {
  const kick = formatKick(pick.startAt, "America/Los_Angeles");
  const modelPct = Math.round((pick.modelProbability ?? pick.confidence / 100) * 100);
  const verifiedAt = pick.postedAt
    ? formatKick(pick.postedAt, "America/Los_Angeles")
    : pick.lockedOddsJson.capturedAt
      ? formatKick(pick.lockedOddsJson.capturedAt, "America/Los_Angeles")
      : "pending";
  const bullets = pick.reason
    .replace(/^Why BoatBoyz likes it:\s*/i, "")
    .split(/\n/)
    .map((s) => s.replace(/^[•*-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
  const why = bullets.length ? bullets.map((b) => `• ${b}`).join("\n") : pick.reason;
  return [
    "🌊 BOATBOYZ OFFICIAL PLAY",
    "",
    pick.sport,
    `${pick.selection} ${vsLine(pick, game)}`,
    "",
    `BoatBoyz Probability: ${modelPct}%`,
    `DraftKings at posting: ${formatAmerican(pick.lockedOdds)}${pick.lockedLine != null ? ` · ${pick.lockedLine}` : ""}`,
    `Units: ${Number(pick.units).toFixed(1)}U`,
    "",
    "Why:",
    why,
    "",
    `Game: ${kick}`,
    scoreLine(game).replace("Score: not started", "Score: Not started"),
    `DK line verified: ${verifiedAt}`,
  ].join("\n");
}

export function buildRecapMessage(
  pick: PickRow,
  game: GameCard,
  result: PickResult,
  profit: number,
  record: DeskRecord,
): string {
  const tag =
    result === "WIN" ? "CASH" : result === "LOSS" ? "LOSS" : result === "PUSH" ? "PUSH" : "VOID";
  const final =
    game.home.score != null && game.away.score != null
      ? `Final ${game.away.abbr} ${game.away.score} @ ${game.home.abbr} ${game.home.score}`
      : game.status.toUpperCase();
  return [
    `**${tag}** · ${pick.sport}`,
    pick.selection,
    final,
    `${formatUnits(profit)} · this ticket`,
    `Desk ${record.wins}-${record.losses}-${record.pushes}  ${formatUnits(record.units)}`,
  ].join("\n");
}
