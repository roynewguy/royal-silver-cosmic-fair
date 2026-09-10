import { formatAmerican, formatClock, formatKick, formatLine, formatUnits } from "../utils.ts";
import type { DeskRecord, GameCard, PickResult, PickRow } from "./types.ts";

/** Discord embed subset used for BoatBoyz cards. */
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

/** Brand gold left-bar (#D4AF37) — customer pick/result cards. */
export const OFFICIAL_EMBED_COLOR = 0xD4AF37;
/** Operator-only alert bar. Never used on customer picks. */
export const ALERT_EMBED_COLOR = 0xC0392B;
export const NO_PLAY_EMBED_COLOR = 0x5C6370;

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

/** Unique public ticket id. Ledger id is the source of truth. */
export function ticketId(pick: PickRow | { id: number }): string {
  const id = Number(pick.id);
  if (!Number.isFinite(id) || id <= 0) return "BB-TEST";
  return `BB-${id}`;
}

export function publicModelLabel(version: string | null | undefined): string {
  const v = (version ?? "").trim().toLowerCase();
  if (!v) return "V2";
  if (v.startsWith("v2-") || v === "v2") return "V2";
  if (v.startsWith("v3-") || v === "v3") return "V3";
  if (v.startsWith("v4-") || v === "v4") return "V4";
  if (v === "model-yacht" || v.startsWith("model-yacht-")) return "Model Yacht";
  return "V2";
}

function parseIso(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

export type FrozenOfficialCard = {
  selection: string;
  market: string;
  side: string;
  lockedOdds: number;
  lockedLine: number | null;
  sportsbook: string;
  postedAt: string | null;
};

/**
 * Official Discord cards may only show the freeze (or the immutable pick row).
 * Later GameCard / market quotes are never a source.
 */
export function frozenOfficialCard(pick: PickRow): FrozenOfficialCard {
  let freeze: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(pick.freezeJson ?? "{}") as Record<string, unknown>;
    if (parsed && typeof parsed === "object") freeze = parsed;
  } catch {
    /* pick-row fields are the fallback freeze */
  }
  const freezeOdds = freeze.odds && typeof freeze.odds === "object"
    ? freeze.odds as { book?: unknown }
    : null;
  const selection =
    (typeof freeze.selection === "string" && freeze.selection.trim())
    || (pick.selection ?? "").trim()
    || "PICK";
  const market =
    (typeof freeze.market === "string" && freeze.market.trim())
    || pick.market
    || "moneyline";
  const side =
    (typeof freeze.side === "string" && freeze.side.trim())
    || pick.side
    || "home";
  const lockedOdds = typeof freeze.lockedOdds === "number" && Number.isFinite(freeze.lockedOdds)
    ? freeze.lockedOdds
    : pick.lockedOdds;
  const lockedLine = freeze.lockedLine === null
    ? null
    : typeof freeze.lockedLine === "number" && Number.isFinite(freeze.lockedLine)
      ? freeze.lockedLine
      : pick.lockedLine;
  const sportsbook =
    (typeof freeze.sportsbook === "string" && freeze.sportsbook.trim())
    || (typeof freezeOdds?.book === "string" && freezeOdds.book.trim())
    || (pick.lockedOddsJson?.book || "").trim()
    || "DraftKings";
  const postedAt =
    parseIso(freeze.postedTimestamp)
    ?? parseIso(freeze.frozenAt)
    ?? parseIso(pick.postedAt);
  return { selection, market, side, lockedOdds, lockedLine, sportsbook, postedAt };
}

function pickFromFreeze(pick: PickRow): PickRow {
  const frozen = frozenOfficialCard(pick);
  return {
    ...pick,
    selection: frozen.selection,
    market: frozen.market as PickRow["market"],
    side: frozen.side as PickRow["side"],
    lockedOdds: frozen.lockedOdds,
    lockedLine: frozen.lockedLine,
    postedAt: frozen.postedAt,
    lockedOddsJson: { ...pick.lockedOddsJson, book: frozen.sportsbook },
  };
}

/** Proven freeze/posted clock only. Never invent Date.now(). */
export function postedClockPt(iso: string | null | undefined): string {
  const stamp = parseIso(iso);
  if (!stamp) return "—";
  const clock = formatClock(stamp, "America/Los_Angeles");
  return clock ? `${clock} PT` : "—";
}

export function marketLabel(market: string | null | undefined): string {
  const m = (market ?? "").toLowerCase();
  if (m === "moneyline" || m === "ml") return "Moneyline";
  if (m === "spread") return "Spread";
  if (m === "total") return "Total";
  return market?.trim() || "Moneyline";
}

export function lineLabel(pick: PickRow): string {
  const card = frozenOfficialCard(pick);
  if (card.market === "moneyline" || card.lockedLine == null || !Number.isFinite(card.lockedLine)) return "—";
  return formatLine(card.lockedLine);
}

/** The actual BET, e.g. "Dodgers ML -125". Frozen selection + frozen odds only. */
export function customerPickLine(pick: PickRow): string {
  const card = frozenOfficialCard(pick);
  const odds = formatAmerican(card.lockedOdds);
  const sel = card.selection;
  if (odds !== "—" && sel.includes(odds)) return sel;
  return odds === "—" ? sel : `${sel} ${odds}`;
}

export function stakeLabel(n: number | null | undefined): string {
  const v = Number(n ?? 1);
  if (!Number.isFinite(v)) return "1u";
  const rounded = Math.round(v * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${text}u`;
}

export function matchupVsChip(pick: PickRow, game?: GameCard | null): string {
  if (game?.away?.name && game?.home?.name) return `${game.away.name} vs ${game.home.name}`;
  const raw = (pick.matchup || "").trim();
  if (!raw) return "Matchup TBD";
  return raw.replace(/\s*@\s*/, " vs ");
}

export function pickedSideTitle(pick: PickRow, game?: GameCard | null): string {
  const card = frozenOfficialCard(pick);
  if (card.side === "home") return game?.home.name ?? card.selection;
  if (card.side === "away") return game?.away.name ?? card.selection;
  if (card.side === "over") return "Over";
  if (card.side === "under") return "Under";
  return card.selection;
}

/** Bold bet line for embed description, e.g. **Lakers -3.5** @ **-110**. */
export function boldBetLine(pick: PickRow): string {
  const card = frozenOfficialCard(pick);
  return `**${card.selection}** @ **${formatAmerican(card.lockedOdds)}**`;
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

export function officialTierBadge(pick: PickRow): string {
  if (resolvePickTier(pick) === "soft_floor") return "📋 **BEST AVAILABLE / DESK PICK**";
  return "🔒 **LOCK**";
}

export function officialPlayHeadline(pick: PickRow): string {
  return `${officialTierBadge(pick)} · 🌊 BoatBoyzPicks OFFICIAL PLAY`;
}

export function officialPlaySubhead(pick: PickRow): string | null {
  if (resolvePickTier(pick) === "soft_floor") {
    return "Soft floor · below hard edge/qualifying — verified DraftKings number only · not a hard-edge play";
  }
  return "Hard-edge qualifying play · verified DraftKings number";
}

export function officialTierBadgePlain(pick: PickRow): string {
  if (resolvePickTier(pick) === "soft_floor") return "BOATBOYZ DESK";
  return "🚨 BOATBOYZ LOCK";
}

export function unitsFieldLabel(pick: PickRow): string {
  const stake = stakeLabel(pick.units);
  return resolvePickTier(pick) === "soft_floor" ? `${stake} desk` : `${stake} LOCK`;
}

export function sportsbookName(pick: PickRow): string {
  return frozenOfficialCard(pick).sportsbook;
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

function field(name: string, value: string, inline = true): DiscordEmbedField {
  return { name, value: value || "—", inline };
}

/**
 * Customer official pick card.
 * The BET is the hero. Internal PASS/no-vig/confidence stays off this card.
 * Odds/line/book/posted clock come from the freeze — never a later quote.
 */
export function buildOfficialPickEmbed(pick: PickRow, game?: GameCard | null): DiscordEmbed {
  const frozenPick = pickFromFreeze(pick);
  const card = frozenOfficialCard(pick);
  const matchup = matchupVsChip(frozenPick, game);
  const bet = customerPickLine(frozenPick);
  const posted = postedClockPt(card.postedAt);
  const kick = formatKick(frozenPick.startAt, "America/Los_Angeles");
  const id = ticketId(frozenPick);
  const book = card.sportsbook;
  const placeUrl = verifiedPlaceBetUrl(pick);
  const description = [
    frozenPick.sport,
    matchup,
    "",
    "**PICK**",
    `**${bet}**`,
    "",
    `Sportsbook: ${book}`,
    `Posted: ${posted}`,
    `Ticket: ${id}`,
  ].join("\n");

  const embed: DiscordEmbed = {
    author: { name: officialTierBadgePlain(pick) },
    description: description.slice(0, 4096),
    color: OFFICIAL_EMBED_COLOR,
    fields: [
      field("Market", marketLabel(card.market)),
      field("Line", lineLabel(frozenPick)),
      field("Odds", formatAmerican(card.lockedOdds)),
      field("Units", stakeLabel(pick.units)),
      field("Model", publicModelLabel(pick.modelVersion)),
      field("Kick", `${kick} PT`),
    ],
    footer: { text: `BoatBoyz · ${id} · ${posted}` },
  };
  if (placeUrl) embed.url = placeUrl;
  return embed;
}

export function buildOfficialPickPayload(pick: PickRow, game?: GameCard | null): DiscordWebhookPayload {
  return { content: "", embeds: [buildOfficialPickEmbed(pick, game)] };
}

export function resultBadgePlain(result: PickResult): string {
  if (result === "WIN") return "✅ WIN";
  if (result === "LOSS") return "❌ LOSS";
  if (result === "PUSH") return "➖ PUSH";
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
 * Official results card. Frozen posted odds never mutate here.
 * POSTPONED is not a result — callers must not build this embed until graded.
 */
export function buildOfficialResultEmbed(
  pick: PickRow,
  game: GameCard,
  result: PickResult,
  profit: number,
  record: DeskRecord,
): DiscordEmbed {
  const frozenPick = pickFromFreeze(pick);
  const card = frozenOfficialCard(pick);
  const kick = formatKick(frozenPick.startAt, "America/Los_Angeles");
  const manual = pick.pickSource && pick.pickSource !== "auto" ? " · MANUAL" : "";
  const badge = resultBadgePlain(result);
  const bet = customerPickLine(frozenPick);
  const id = ticketId(frozenPick);
  const frozenOdds = formatAmerican(card.lockedOdds);
  const description = [
    frozenPick.sport,
    matchupVsChip(frozenPick, game),
    "",
    "**PICK**",
    `**${bet}**`,
  ].join("\n");

  return {
    author: { name: `${badge}${manual} · BoatBoyz` },
    description: description.slice(0, 4096),
    color: OFFICIAL_EMBED_COLOR,
    fields: [
      field("Result", badge),
      field("P/L", formatUnits(profit)),
      field("Record", autoRecordLine(record)),
      field("Frozen odds", frozenOdds),
      field("Final", finalScoreLine(game), false),
      field("Ticket", id),
      field("Kick", `${kick} PT`),
    ],
    footer: { text: `BoatBoyz · ${id} · original ${frozenOdds}` },
  };
}

export function buildOfficialResultPayload(
  pick: PickRow,
  game: GameCard,
  result: PickResult,
  profit: number,
  record: DeskRecord,
): DiscordWebhookPayload {
  return { content: "", embeds: [buildOfficialResultEmbed(pick, game, result, profit, record)] };
}

export function serializeResultWebhookBody(body: string | DiscordWebhookPayload): string {
  if (typeof body === "string") return body;
  return JSON.stringify({
    content: body.content ?? "",
    embeds: body.embeds ?? [],
  });
}

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

export function buildNoPlayMessage(): string {
  return [
    "NO QUALIFYING PLAYS TODAY",
    "",
    "BoatBoyz did not find a setup that cleared production requirements.",
  ].join("\n");
}

export function buildNoPlayEmbed(): DiscordEmbed {
  return {
    author: { name: "BoatBoyz" },
    description: [
      "**NO QUALIFYING PLAYS TODAY**",
      "",
      "BoatBoyz did not find a setup that cleared production requirements.",
    ].join("\n"),
    color: NO_PLAY_EMBED_COLOR,
    footer: { text: "BoatBoyz · no official pick" },
  };
}

export function buildNoPlayPayload(): DiscordWebhookPayload {
  return { content: "", embeds: [buildNoPlayEmbed()] };
}

export function buildOwnerAlertEmbed(code: string, detail: string): DiscordEmbed {
  return {
    author: { name: "OPERATOR ALERT" },
    description: [`**${code}**`, "", detail.trim() || "See operator desk."].join("\n").slice(0, 4096),
    color: ALERT_EMBED_COLOR,
    footer: { text: "Operator only — not a customer pick" },
  };
}

export function buildOwnerAlertPayload(code: string, detail: string): DiscordWebhookPayload {
  return {
    content: `CRITICAL ${code}`,
    embeds: [buildOwnerAlertEmbed(code, detail)],
  };
}

export type LaunchPreviewKind =
  | "official-lock"
  | "result-win"
  | "result-loss"
  | "result-push"
  | "result-void"
  | "no-play"
  | "operator-alert";

export function launchPreviewLabel(kind: LaunchPreviewKind): string {
  switch (kind) {
    case "official-lock":
      return "TEST SAMPLE · official LOCK";
    case "result-win":
      return "TEST SAMPLE · WIN";
    case "result-loss":
      return "TEST SAMPLE · LOSS";
    case "result-push":
      return "TEST SAMPLE · PUSH";
    case "result-void":
      return "TEST SAMPLE · VOID";
    case "no-play":
      return "TEST SAMPLE · no-play";
    case "operator-alert":
      return "TEST SAMPLE · operator alert";
  }
}
