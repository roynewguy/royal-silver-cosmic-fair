import { channelWebhook } from "./discord-routing.ts";
import { formatAmerican, formatKick, formatUnits } from "../utils.ts";
import { parseWhy, previewNotes, defaultPlayReason } from "./why.ts";
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
  const url = channelWebhook("picks", stored ?? "");
  return { url, source: !url ? "none" : process.env.DISCORD_PICKS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL ? "env" : "desk" };
}

function waitUrl(url: string) {
  const u = new URL(url);
  u.searchParams.set("wait", "true");
  return u.toString();
}

export async function postWebhook(url: string, content: string): Promise<{ ok: boolean; id?: string; error?: string; uncertain?: boolean }> {
  if (!discordWebhookOk(url)) return { ok: false, error: "Invalid Discord webhook." };
  try {
    const res = await fetch(waitUrl(url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "BoatBoyzPicks/1.0",
      },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ username: "BoatBoyzPicks", content: content.slice(0, 1900), allowed_mentions: { parse: [] }, flags: 4 }),
    });
    // 5xx/transport failures may occur AFTER Discord accepted the message.
    if (!res.ok) return { ok: false, uncertain: res.status >= 500, error: `Discord HTTP ${res.status}` };
    const body = await res.json() as { id?: string };
    if (!body.id) return { ok: false, uncertain: true, error: "Discord confirmation missing message id" };
    return { ok: true, id: body.id };
  } catch {
    return { ok: false, uncertain: true, error: "DELIVERY_UNKNOWN: Discord transport/confirmation failed" };
  }
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
      headers: { "User-Agent": "BoatBoyzPicks/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok || res.status === 404) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Discord ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Discord delete failed." };
  }
}

function pctLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const pct = n > 1.5 ? n : n * 100;
  return `${Math.round(pct)}%`;
}

function edgeLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Math.abs(n) <= 1 && n !== 0 ? n * 100 : n;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function whyBlock(reason: string, heading = "WHY BoatBoyzPicks LIKES IT"): string[] {
  const parsed = parseWhy(reason);
  const bullets = parsed.bullets.slice(0, 5).map((b) => `• ${b}`);
  const body = [parsed.writeup, ...bullets].filter(Boolean);
  if (!body.length) {
    return [
      heading,
      "BoatBoyzPicks scanned the board and this is the strongest straight bet left on the slate.",
    ];
  }
  return [heading, ...body];
}

export function buildOperatorPost(body: string): string | null {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  return text.slice(0, 1900);
}

export function buildTestPreviewMessage(game: GameCard): string {
  const notes = previewNotes(game);
  const bullets = notes.bullets.map((b) => `• ${b}`);
  const current = game.odds.details || game.rank?.selection || "No current line available";
  return [
    "🧪 BoatBoyzPicks TEST PREVIEW — NOT AN OFFICIAL PICK",
    "",
    `${sportEmoji(game.sport)} ${game.sport}`,
    `${game.away.abbr} @ ${game.home.abbr}`,
    `Current odds: ${current}`,
    `Game: ${formatKick(game.startAt, "America/Los_Angeles")} PT`,
    scoreLine(game).replace("Score: not started", "Score: Not started"),
    "",
    "DESK NOTES",
    notes.writeup,
    ...bullets,
    "",
    "This message only verifies Discord + the current board. It is not an official BoatBoyzPicks play.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function stakeLabel(n: number | null | undefined): string {
  const v = Number(n ?? 1);
  return `${Number.isFinite(v) ? v.toFixed(1) : "1.0"}U`;
}

function opponentName(pick: PickRow, game?: GameCard | null): string {
  if (pick.side === "home") return `vs ${game?.away.name ?? "opponent"}`;
  if (pick.side === "away") return `at ${game?.home.name ?? "opponent"}`;
  if (game) return `${game.away.abbr} @ ${game.home.abbr}`;
  return pick.matchup;
}

export function buildManualPickMessage(pick: PickRow, game?: GameCard | null): string {
  const live = pick.pickSource === "manual_live" || game?.status === "in_progress";
  const kick = formatKick(pick.startAt, "America/Los_Angeles");
  const posted = pick.postedAt ? formatKick(pick.postedAt, "America/Los_Angeles") : kick;
  const odds =
    pick.lockedLine != null && Number.isFinite(pick.lockedLine) && pick.market !== "moneyline"
      ? `${formatAmerican(pick.lockedOdds)} · ${pick.lockedLine > 0 ? `+${pick.lockedLine}` : pick.lockedLine}`
      : formatAmerican(pick.lockedOdds);
  const reason = pick.reason?.trim() || (game ? defaultPlayReason(game, pick.side) : "");
  const lines = live
    ? [
        "🔴 🌊 BoatBoyzPicks LIVE PLAY",
        "",
        `${sportEmoji(pick.sport)} ${pick.sport}`,
        `**${pick.selection}**`,
        opponentName(pick, game),
        "",
        `Live: ${odds}`,
        `Units: ${stakeLabel(pick.units)}`,
        "",
        pick.postedScore || scoreLine(game).replace("Score: ", ""),
        pick.postedState ? pick.postedState : null,
        "",
        `Posted ${posted} PT`,
      ]
    : [
        "🌊 BoatBoyzPicks PLAY",
        "",
        `${sportEmoji(pick.sport)} ${pick.sport}`,
        `**${pick.selection}**`,
        opponentName(pick, game),
        "",
        `Odds: ${odds}`,
        `Units: ${stakeLabel(pick.units)}`,
        "",
        `Game: ${kick} PT`,
      ];
  if (reason) lines.push("", ...whyBlock(reason));
  return lines.filter((line): line is string => line != null && line !== undefined).join("\n");
}

export function scoreLine(game?: GameCard | null): string {
  if (!game) return "Score: —";
  const away = `${game.away.abbr} ${game.away.score ?? "—"}`;
  const home = `${game.home.abbr} ${game.home.score ?? "—"}`;
  if (game.status === "scheduled" || (game.away.score == null && game.home.score == null)) return "Score: not started";
  if (game.status === "in_progress") return `Score: ${away} @ ${home} (LIVE)`;
  if (game.status === "final") return `Final: ${away} @ ${home}`;
  return `Score: ${away} @ ${home}`;
}

export function favoredLine(pick: PickRow): string {
  const p = pick.modelProbability;
  if (p == null) return "BoatBoyzPicks Probability: unavailable";
  const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  return `BoatBoyzPicks Probability: ${pct}%`;
}

export function currentLine(pick: PickRow): string {
  const book = pick.lockedOddsJson.book || "Unverified book";
  const odds = formatAmerican(pick.lockedOdds);
  const line = pick.lockedLine == null || !Number.isFinite(pick.lockedLine)
    ? ""
    : pick.market === "total" ? ` · total ${pick.lockedLine}` : ` · line ${pick.lockedLine > 0 ? `+${pick.lockedLine}` : pick.lockedLine}`;
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

export function resolvePickTier(pick: PickRow): "lock" | "soft_floor" {
  try {
    const frozen = JSON.parse(pick.freezeJson ?? "{}") as { pickTier?: string; softFloor?: boolean };
    if (frozen.pickTier === "soft_floor" || frozen.softFloor === true) return "soft_floor";
    if (frozen.pickTier === "lock") return "lock";
  } catch {
    /* missing freeze is fine for previews */
  }
  return "lock";
}

/** LOCK for hard-edge plays; BEST AVAILABLE / DESK PICK for soft-floor. */
export function officialPlayHeadline(pick: PickRow): string {
  if (resolvePickTier(pick) === "soft_floor") {
    return "🌊 BoatBoyzPicks OFFICIAL PLAY · BEST AVAILABLE / DESK PICK";
  }
  return "🌊 BoatBoyzPicks OFFICIAL PLAY · LOCK";
}

export function officialPlaySubhead(pick: PickRow): string | null {
  if (resolvePickTier(pick) === "soft_floor") {
    return "Below hard edge/qualifying floor — verified DraftKings number only";
  }
  return null;
}

export function buildDiscordMessage(pick: PickRow, game?: GameCard | null): string {
  const kick = formatKick(pick.startAt, "America/Los_Angeles");
  const modelPct = pick.modelProbability == null ? "unavailable" : Math.round(pick.modelProbability * 100);
  let frozen: { marketProbability?: number } = {};
  try { frozen = JSON.parse(pick.freezeJson ?? "{}"); } catch { /* show missing */ }
  const marketPct = frozen.marketProbability == null ? "unavailable" : pctLabel(frozen.marketProbability);
  const edge = pick.modelEdge ?? pick.edgePct;
  const verifiedAt = pick.postedAt ? formatKick(pick.postedAt, "America/Los_Angeles") : pick.lockedOddsJson.capturedAt ? formatKick(pick.lockedOddsJson.capturedAt, "America/Los_Angeles") : "pending";
  const dkLine = pick.lockedLine == null || !Number.isFinite(pick.lockedLine) ? formatAmerican(pick.lockedOdds) : `${formatAmerican(pick.lockedOdds)} · ${pick.lockedLine}`;
  const reason = (pick.reason?.trim() || (game ? defaultPlayReason(game, pick.side) : "")).trim();
  const sub = officialPlaySubhead(pick);
  return [
    officialPlayHeadline(pick),
    sub,
    "",
    `${sportEmoji(pick.sport)} ${pick.sport}`,
    `**${pick.selection}**`,
    vsLine(pick, game),
    "",
    `DraftKings: ${dkLine}`,
    `BoatBoyzPicks Probability: ${modelPct}%\nMarket No-Vig: ${marketPct}\nEstimated Edge: ${edgeLabel(edge)}`,
    `Confidence ${Math.round(pick.confidence)} · ${stakeLabel(pick.units)}`,
    "",
    ...whyBlock(reason),
    "",
    `Game: ${kick} PT`,
    scoreLine(game).replace("Score: not started", "Score: Not started"),
    `Verified ${verifiedAt} PT`,
    pick.modelVersion ? `Model ${pick.modelVersion}` : null,
  ].filter((line): line is string => line != null && line !== undefined).join("\n");
}

export function buildRecapMessage(pick: PickRow, game: GameCard, result: PickResult, profit: number, record: DeskRecord): string {
  const tag = result === "WIN" ? "WIN" : result === "LOSS" ? "LOSS" : result === "PUSH" ? "PUSH" : "VOID";
  const final = game.home.score != null && game.away.score != null ? `Final ${game.away.abbr} ${game.away.score} @ ${game.home.abbr} ${game.home.score}` : game.status.toUpperCase();
  return [`**${tag}** · ${pick.sport}${pick.pickSource && pick.pickSource !== "auto" ? " · MANUAL" : ""}`, pick.selection, final, `${formatUnits(profit)} · this ticket`, `Auto record ${record.wins}-${record.losses}-${record.pushes} · ${formatUnits(record.units)}${record.riskedUnits ? ` · ROI ${(record.units / record.riskedUnits * 100).toFixed(1)}%` : ""}`].join("\n");
}
