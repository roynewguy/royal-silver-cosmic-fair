import { channelWebhook } from "./discord-routing.ts";
import { formatAmerican, formatKick, formatUnits } from "../utils.ts";
import { formatClvSummaryLine, type ClvSummary } from "./closing.ts";
import { parseWhy, previewNotes, defaultPlayReason } from "./why.ts";
import { buildWeeklyRecap, weekSunday } from "./weekly-recap.ts";
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

/** Discord embed subset used for official pick cards. */
export type DiscordEmbedField = { name: string; value: string; inline?: boolean };
export type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  author?: { name: string };
};

export type DiscordWebhookPayload = {
  content?: string;
  embeds?: DiscordEmbed[];
};

/** Brand gold left-bar (#D4AF37) — BoatBoyzPicks official pick cards. */
export const OFFICIAL_EMBED_COLOR = 0xD4AF37;

export function normalizeWebhookPayload(body: string | DiscordWebhookPayload): DiscordWebhookPayload {
  if (typeof body === "string") return { content: body };
  return {
    content: body.content,
    embeds: body.embeds?.slice(0, 10),
  };
}

export async function postWebhook(
  url: string,
  body: string | DiscordWebhookPayload,
  opts?: { username?: string },
): Promise<{ ok: boolean; id?: string; error?: string; uncertain?: boolean; authFailure?: boolean }> {  if (!discordWebhookOk(url)) return { ok: false, error: "Invalid Discord webhook." };
  const payload = normalizeWebhookPayload(body);
  const content = (payload.content ?? "").slice(0, 1900);
  const embeds = payload.embeds?.length ? payload.embeds : undefined;
  if (!content && !embeds?.length) return { ok: false, error: "Discord payload empty." };
  try {
    const wire: Record<string, unknown> = {
      username: opts?.username?.trim() || "BoatBoyzPicks",
      allowed_mentions: { parse: [] },
    };
    if (content) wire.content = content;
    if (embeds?.length) wire.embeds = embeds;
    // Suppress link unfurls on plain-text posts only — never suppress our own embeds[].
    if (!embeds?.length) wire.flags = 4;
    const res = await fetch(waitUrl(url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "BoatBoyzPicks/1.0",
      },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify(wire),
    });
    // 5xx/transport failures may occur AFTER Discord accepted the message.
    // 401/403 are definite auth failures → alerts path; never uncertain blind-repost.
    if (!res.ok) {
      const authFailure = res.status === 401 || res.status === 403;
      return {
        ok: false,
        uncertain: res.status >= 500,
        authFailure,
        error: `Discord HTTP ${res.status}`,
      };
    }
    const json = await res.json() as { id?: string };
    if (!json.id) return { ok: false, uncertain: true, error: "Discord confirmation missing message id" };
    return { ok: true, id: json.id };
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

/** PATCH is repeatable against a known message; never recreate a missing scoreboard. */
export async function editWebhookMessage(
  url: string,
  id: string,
  body: string | DiscordWebhookPayload,
): Promise<{ ok: boolean; missing?: boolean }> {
  if (!discordWebhookOk(url) || !/^\d+$/.test(id)) return { ok: false };
  const target = new URL(url);
  target.pathname = target.pathname.replace(/\/$/, "") + `/messages/${id}`;
  target.search = "";
  const payload = normalizeWebhookPayload(body);
  const content = (payload.content ?? "").slice(0, 1900);
  const embeds = payload.embeds?.length ? payload.embeds : undefined;
  const wire: Record<string, unknown> = { allowed_mentions: { parse: [] } };
  // Always send content key so embed-only updates clear leftover plain text.
  wire.content = content;
  if (embeds?.length) wire.embeds = embeds;
  try {
    const res = await fetch(target, { method: "PATCH", headers: { "Content-Type": "application/json", "User-Agent": "BoatBoyzPicks/1.0" },
      signal: AbortSignal.timeout(12_000), body: JSON.stringify(wire) });
    return { ok: res.ok, missing: res.status === 404 };
  } catch { return { ok: false }; }
}

export function buildRecordScoreboard(record: DeskRecord, clv?: ClvSummary | null): string {
  const roi = record.riskedUnits ? `${(record.units / record.riskedUnits * 100).toFixed(1)}%` : "—";
  const lines = [
    "🌊 **BOATBOYZ • OFFICIAL SCOREBOARD**",
    "🕒 Timezone: **PT** (America/Los_Angeles)",
    "",
    `✅ **W-L-P** · **${record.wins}-${record.losses}-${record.pushes}**`,
    `💰 Net units: **${formatUnits(record.units)}**`,
    `📊 ROI: **${roi}**`,
    `⏳ Pending: **${record.pending}**`,
  ];
  if (clv && clv.sample > 0) lines.push(formatClvSummaryLine(clv, "CLV (straights · tip closes)"));
  lines.push(
    "",
    "🤖 Automated official picks only • Test, paper and manual plays excluded.",
    "CLV uses real tip/start DraftKings quotes only — never invented.",
    "🔄 This message updates automatically. Every official result stays recorded.",
  );
  return lines.join("\n");
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

function whyBlock(reason: string, heading = "🔎 **WHY BoatBoyzPicks LIKES IT**"): string[] {
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

/** Official stake text on Discord cards, e.g. 1u / 0.5u. */
export function stakeLabel(n: number | null | undefined): string {
  const v = Number(n ?? 1);
  if (!Number.isFinite(v)) return "1u";
  const rounded = Math.round(v * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${text}u`;
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

/**
 * Loud primary badge for official Discord posts.
 * Soft-floor must NEVER emit a LOCK badge — only BEST AVAILABLE / DESK PICK.
 * LOCK only when pickTier is lock and softFloor is not true.
 */
export function officialTierBadge(pick: PickRow): string {
  if (resolvePickTier(pick) === "soft_floor") {
    return "📋 **BEST AVAILABLE / DESK PICK**";
  }
  return "🔒 **LOCK**";
}

/** LOCK for hard-edge plays; BEST AVAILABLE / DESK PICK for soft-floor. */
export function officialPlayHeadline(pick: PickRow): string {
  return `${officialTierBadge(pick)} · 🌊 BoatBoyzPicks OFFICIAL PLAY`;
}

export function officialPlaySubhead(pick: PickRow): string | null {
  if (resolvePickTier(pick) === "soft_floor") {
    return "Soft floor · below hard edge/qualifying — verified DraftKings number only · not a hard-edge play";
  }
  return "Hard-edge qualifying play · verified DraftKings number";
}

/** Plain badge text for embed author (no markdown). Soft never says LOCK. */
export function officialTierBadgePlain(pick: PickRow): string {
  if (resolvePickTier(pick) === "soft_floor") return "📋 BEST AVAILABLE / DESK PICK";
  return "🔒 LOCK";
}

/** Units field on embed cards: "1u LOCK" vs "0.5u desk". */
export function unitsFieldLabel(pick: PickRow): string {
  const stake = stakeLabel(pick.units);
  return resolvePickTier(pick) === "soft_floor" ? `${stake} desk` : `${stake} LOCK`;
}

export function matchupVsChip(pick: PickRow, game?: GameCard | null): string {
  if (game?.away?.name && game?.home?.name) return `${game.away.name} vs ${game.home.name}`;
  const raw = (pick.matchup || "").trim();
  if (!raw) return "Matchup TBD";
  return raw.replace(/\s*@\s*/, " vs ");
}

export function pickedSideTitle(pick: PickRow, game?: GameCard | null): string {
  if (pick.side === "home") return game?.home.name ?? pick.selection;
  if (pick.side === "away") return game?.away.name ?? pick.selection;
  if (pick.side === "over") return "Over";
  if (pick.side === "under") return "Under";
  return pick.selection;
}

/** Bold bet line for embed description, e.g. **Lakers -3.5** @ **-110**. */
export function boldBetLine(pick: PickRow): string {
  return `**${pick.selection}** @ **${formatAmerican(pick.lockedOdds)}**`;
}

/** Real DraftKings deep-link only — never invent from Odds API event ids. */
export function verifiedPlaceBetUrl(pick: PickRow): string | undefined {
  try {
    const frozen = JSON.parse(pick.freezeJson ?? "{}") as { placeBetUrl?: unknown };
    const url = typeof frozen.placeBetUrl === "string" ? frozen.placeBetUrl.trim() : "";
    if (!url) return undefined;
    const u = new URL(url);
    if (u.protocol !== "https:") return undefined;
    const host = u.hostname.toLowerCase();
    if (host !== "sportsbook.draftkings.com" && host !== "draftkings.com" && !host.endsWith(".draftkings.com")) {
      return undefined;
    }
    return u.toString();
  } catch {
    return undefined;
  }
}

function whyEmbedLines(reason: string): string[] {
  const parsed = parseWhy(reason);
  const lines: string[] = [];
  if (parsed.writeup) {
    const sentences = parsed.writeup.replace(/\s+/g, " ").trim().split(/(?<=\.)\s+/).filter(Boolean);
    lines.push(...sentences.slice(0, 4));
  }
  for (const b of parsed.bullets.slice(0, 3)) {
    if (lines.length >= 4) break;
    lines.push(b);
  }
  if (!lines.length) {
    lines.push("BoatBoyzPicks scanned the board and this is the strongest straight bet left on the slate.");
  }
  return lines.slice(0, 4);
}

/**
 * Official Discord embed card — gold bar, navy desk vibe, straights only look.
 * Soft-floor badge is never LOCK.
 */
export function buildOfficialPickEmbed(pick: PickRow, game?: GameCard | null): DiscordEmbed {
  const reason = (pick.reason?.trim() || (game ? defaultPlayReason(game, pick.side) : "")).trim();
  const why = whyEmbedLines(reason);
  const kick = formatKick(pick.startAt, "America/Los_Angeles");
  const edge = pick.modelEdge ?? pick.edgePct;
  const book = (pick.lockedOddsJson?.book || "DraftKings").trim() || "DraftKings";
  const matchup = matchupVsChip(pick, game);
  const sideTitle = pickedSideTitle(pick, game);
  const placeUrl = verifiedPlaceBetUrl(pick);
  const sub = officialPlaySubhead(pick);
  const description = [
    `${sportEmoji(pick.sport)} **${sideTitle}** | ${matchup}`,
    boldBetLine(pick),
    `\`${matchup}\``,
    "",
    sub,
    "",
    "🔎 **WHY BoatBoyzPicks LIKES IT**",
    ...why,
  ]
    .filter((line): line is string => line != null && line !== undefined)
    .join("\n");

  const embed: DiscordEmbed = {
    author: { name: `${officialTierBadgePlain(pick)} · BoatBoyzPicks OFFICIAL` },
    description: description.slice(0, 4096),
    color: OFFICIAL_EMBED_COLOR,
    fields: [
      { name: "Edge %", value: edgeLabel(edge), inline: true },
      { name: "Book", value: book, inline: true },
      { name: "Units", value: unitsFieldLabel(pick), inline: true },
      { name: "Kick PT", value: `${kick} PT`, inline: true },
    ],
    footer: { text: `BoatBoyzPicks · ${kick} PT` },
  };
  if (placeUrl) embed.url = placeUrl;
  return embed;
}

/** Webhook body for official picks: embed card, empty/short content. */
export function buildOfficialPickPayload(pick: PickRow, game?: GameCard | null): DiscordWebhookPayload {
  return {
    content: "",
    embeds: [buildOfficialPickEmbed(pick, game)],
  };
}

export function buildDiscordMessage(pick: PickRow, game?: GameCard | null): string {
  const kick = formatKick(pick.startAt, "America/Los_Angeles");
  const modelPct = pick.modelProbability == null ? "unavailable" : Math.round(pick.modelProbability * 100);
  let frozen: { marketProbability?: number } = {};
  try { frozen = JSON.parse(pick.freezeJson ?? "{}"); } catch { /* show missing */ }
  const marketPct = frozen.marketProbability == null ? "unavailable" : pctLabel(frozen.marketProbability);
  const edge = pick.modelEdge ?? pick.edgePct;
  const verifiedAt = pick.lockedOddsJson.capturedAt ? formatKick(pick.lockedOddsJson.capturedAt, "America/Los_Angeles") : "unavailable";
  const dkLine = pick.lockedLine == null || !Number.isFinite(pick.lockedLine) ? formatAmerican(pick.lockedOdds) : `${formatAmerican(pick.lockedOdds)} · ${pick.lockedLine}`;
  const reason = (pick.reason?.trim() || (game ? defaultPlayReason(game, pick.side) : "")).trim();
  const sub = officialPlaySubhead(pick);
  return [
    officialPlayHeadline(pick),
    sub,
    "",
    `${sportEmoji(pick.sport)} **${pick.sport} • ${pick.matchup}**`,
    `🎯 **${pick.selection}**`,
    vsLine(pick, game),
    "",
    `🏦 DraftKings: ${dkLine}`,
    `💵 Stake: **${stakeLabel(pick.units)}**`,
    "",
    "📊 **THE NUMBERS**",
    `BoatBoyzPicks Probability: ${modelPct}%\nMarket No-Vig: ${marketPct}\nEstimated Edge: ${edgeLabel(edge)}`,
    `Confidence: ${Math.round(pick.confidence)}/100 (data confidence, not win probability)`,
    "",
    ...whyBlock(reason),
    "",
    `🕒 Game: ${kick} PT`,
    scoreLine(game).replace("Score: not started", "Score: Not started"),
    `✅ Odds verified: ${verifiedAt} PT`,
    pick.modelVersion ? `🤖 Model: ${pick.modelVersion}` : null,
    "Estimated advantage, not a guaranteed win. Every result recorded.",
  ].filter((line): line is string => line != null && line !== undefined).join("\n");
}

export function resultBadgePlain(result: PickResult): string {
  if (result === "WIN") return "✅ WIN";
  if (result === "LOSS") return "❌ LOSS";
  if (result === "PUSH") return "↔️ PUSH";
  return "⚪ VOID";
}

export function finalScoreLine(game: GameCard): string {
  if (game.home.score != null && game.away.score != null) {
    return `Final ${game.away.abbr} ${game.away.score} @ ${game.home.abbr} ${game.home.score}`;
  }
  return game.status.toUpperCase();
}

export function autoRecordLine(record: DeskRecord): string {
  const roi = record.riskedUnits
    ? ` · ROI ${(record.units / record.riskedUnits * 100).toFixed(1)}%`
    : "";
  return `${record.wins}-${record.losses}-${record.pushes} · ${formatUnits(record.units)}${roi}`;
}

/**
 * Official #weekly-recap Discord embed — same gold bar as picks/results (#D4AF37).
 * Presentation polish only; does not invent odds or touch soft/LOCK.
 */
export function buildWeeklyRecapEmbed(
  period: { start: string; end: string },
  week: DeskRecord & { voids: number },
  overall: DeskRecord,
  clv?: ClvSummary | null,
): DiscordEmbed {
  const sunday = weekSunday(period.end);
  const body = buildWeeklyRecap(period, week, overall, clv);
  const description = body.replace(/^🌊 \*\*BOATBOYZ • WEEKLY RECAP\*\*\n?/, "").trim();
  return {
    author: { name: "🌊 BoatBoyzPicks WEEKLY RECAP" },
    description: description.slice(0, 4096),
    color: OFFICIAL_EMBED_COLOR,
    footer: { text: `BoatBoyzPicks · ${period.start}–${sunday} PT` },
  };
}

export function buildWeeklyRecapPayload(
  period: { start: string; end: string },
  week: DeskRecord & { voids: number },
  overall: DeskRecord,
  clv?: ClvSummary | null,
): DiscordWebhookPayload {
  return {
    content: "",
    embeds: [buildWeeklyRecapEmbed(period, week, overall, clv)],
  };
}

/** Plain-text recap (legacy / logs). Live Discord delivery uses buildOfficialResultPayload. */
export function buildRecapMessage(pick: PickRow, game: GameCard, result: PickResult, profit: number, record: DeskRecord): string {
  const tag = result === "WIN" ? "WIN" : result === "LOSS" ? "LOSS" : result === "PUSH" ? "PUSH" : "VOID";
  const manual = pick.pickSource && pick.pickSource !== "auto" ? " · MANUAL" : "";
  return [
    `**${tag}** · ${pick.sport}${manual}`,
    pick.selection,
    finalScoreLine(game),
    `${formatUnits(profit)} · this ticket`,
    `W-L-P ${autoRecordLine(record)}`,
  ].join("\n");
}

/**
 * Official #results Discord embed — same gold bar as pick cards (#D4AF37).
 * Does not touch pick LOCK / soft-floor badge logic.
 */
export function buildOfficialResultEmbed(
  pick: PickRow,
  game: GameCard,
  result: PickResult,
  profit: number,
  record: DeskRecord,
): DiscordEmbed {
  const kick = formatKick(pick.startAt, "America/Los_Angeles");
  const manual = pick.pickSource && pick.pickSource !== "auto" ? " · MANUAL" : "";
  const badge = resultBadgePlain(result);
  const pickLine = `${pick.selection} (${formatAmerican(pick.lockedOdds)})`;
  const description = [
    `${sportEmoji(pick.sport)} **${pick.sport}** · ${matchupVsChip(pick, game)}`,
    boldBetLine(pick),
  ].join("\n");

  return {
    author: { name: `${badge}${manual} · BoatBoyzPicks RESULT` },
    description: description.slice(0, 4096),
    color: OFFICIAL_EMBED_COLOR,
    fields: [
      { name: "Result", value: badge, inline: true },
      { name: "Sport", value: pick.sport, inline: true },
      { name: "Pick", value: pickLine, inline: true },
      { name: "Final", value: finalScoreLine(game), inline: false },
      { name: "This ticket", value: formatUnits(profit), inline: true },
      { name: "W-L-P", value: autoRecordLine(record), inline: true },
      { name: "Kick PT", value: `${kick} PT`, inline: true },
    ],
    footer: { text: `BoatBoyzPicks · ${kick} PT` },
  };
}

export function buildOfficialResultPayload(
  pick: PickRow,
  game: GameCard,
  result: PickResult,
  profit: number,
  record: DeskRecord,
): DiscordWebhookPayload {
  return {
    content: "",
    embeds: [buildOfficialResultEmbed(pick, game, result, profit, record)],
  };
}

/** Persist webhook body in picks.result_message (JSON embed payload or legacy plain text). */
export function serializeResultWebhookBody(body: string | DiscordWebhookPayload): string {
  if (typeof body === "string") return body;
  return JSON.stringify({
    content: body.content ?? "",
    embeds: body.embeds ?? [],
  });
}

/** Decode stored result_message for postWebhook — JSON embed payload or legacy plain text. */
export function parseResultWebhookBody(raw: string): string | DiscordWebhookPayload {
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as DiscordWebhookPayload;
      if (parsed && typeof parsed === "object" && (Array.isArray(parsed.embeds) || typeof parsed.content === "string")) {
        return {
          content: typeof parsed.content === "string" ? parsed.content : "",
          embeds: Array.isArray(parsed.embeds) ? parsed.embeds.slice(0, 10) : undefined,
        };
      }
    } catch {
      /* fall through to plain text */
    }
  }
  return text;
}
