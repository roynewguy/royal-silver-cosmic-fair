import { channelWebhook } from "./discord-routing.ts";
import { formatAmerican, formatKick, formatUnits } from "../utils.ts";
import { formatClvSummaryLine, type ClvSummary } from "./closing.ts";
import { parseWhy, previewNotes, defaultPlayReason } from "./why.ts";
import { buildWeeklyRecap, weekSunday } from "./weekly-recap.ts";
import type { DeskRecord, GameCard, PickResult, PickRow } from "./types.ts";
import {
  OFFICIAL_EMBED_COLOR,
  type DiscordWebhookPayload,
  sportEmoji,
  stakeLabel,
  officialPlayHeadline,
  officialPlaySubhead,
  autoRecordLine,
  finalScoreLine,
} from "./discord-embeds.ts";

export type { DiscordEmbed, DiscordEmbedField, DiscordWebhookPayload, LaunchPreviewKind, FrozenOfficialCard } from "./discord-embeds.ts";
export {
  ALERT_EMBED_COLOR,
  NO_PLAY_EMBED_COLOR,
  OFFICIAL_EMBED_COLOR,
  autoRecordLine,
  boldBetLine,
  buildNoPlayEmbed,
  buildNoPlayMessage,
  buildNoPlayPayload,
  buildOfficialPickEmbed,
  buildOfficialPickPayload,
  buildOfficialResultEmbed,
  buildOfficialResultPayload,
  buildOwnerAlertEmbed,
  buildOwnerAlertPayload,
  customerPickLine,
  finalScoreLine,
  frozenOfficialCard,
  launchPreviewLabel,
  lineLabel,
  marketLabel,
  matchupVsChip,
  officialPlayHeadline,
  officialPlaySubhead,
  officialTierBadge,
  officialTierBadgePlain,
  parseResultWebhookBody,
  pickedSideTitle,
  postedClockPt,
  publicModelLabel,
  resolvePickTier,
  resultBadgePlain,
  serializeResultWebhookBody,
  sportEmoji,
  sportsbookName,
  stakeLabel,
  ticketId,
  unitsFieldLabel,
  verifiedPlaceBetUrl,
} from "./discord-embeds.ts";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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
): Promise<{ ok: boolean; id?: string; error?: string; uncertain?: boolean; authFailure?: boolean }> {
  if (!discordWebhookOk(url)) return { ok: false, error: "Invalid Discord webhook." };
  const payload = normalizeWebhookPayload(body);
  const content = (payload.content ?? "").slice(0, 1900);
  const embeds = payload.embeds?.length ? payload.embeds : undefined;
  if (!content && !embeds?.length) return { ok: false, error: "Discord payload empty." };
  const wire: Record<string, unknown> = {
    username: opts?.username?.trim() || "BoatBoyzPicks",
    allowed_mentions: { parse: [] },
  };
  if (content) wire.content = content;
  if (embeds?.length) wire.embeds = embeds;
  // Suppress link unfurls on plain-text posts only — never suppress our own embeds[].
  if (!embeds?.length) wire.flags = 4;

  let retried429 = false;
  while (true) {
    try {
      const res = await fetch(waitUrl(url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "BoatBoyzPicks/1.0",
        },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify(wire),
      });
      // 429 = Discord rejected the message. One short retry is safe (no duplicate).
      if (res.status === 429 && !retried429) {
        retried429 = true;
        const retry = Number(res.headers.get("retry-after") ?? "1");
        const waitMs = Number.isFinite(retry) ? Math.min(2_000, Math.max(400, retry * 1000)) : 400;
        await sleep(waitMs);
        continue;
      }
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

export function vsLine(pick: PickRow, game?: GameCard | null): string {
  if (pick.side === "home") return `vs ${game?.away.name ?? pick.matchup.split("@")[0]?.trim() ?? "opponent"}`;
  if (pick.side === "away") return `at ${game?.home.name ?? pick.matchup.split("@")[1]?.trim() ?? "opponent"}`;
  return pick.matchup;
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

/**
 * Official #weekly-recap Discord embed — same gold bar as picks/results (#D4AF37).
 * Presentation polish only; does not invent odds or touch soft/LOCK.
 */
export function buildWeeklyRecapEmbed(
  period: { start: string; end: string },
  week: DeskRecord & { voids: number },
  overall: DeskRecord,
  clv?: ClvSummary | null,
): import("./discord-embeds.ts").DiscordEmbed {
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
