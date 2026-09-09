import { isDraftKingsLine } from "./odds-api.ts";
import { formatAmerican } from "../utils.ts";
import { impliedFromAmerican, priceFor, lineFor } from "./odds.ts";
import type { Market, OddsSnapshot, PickRow, Side } from "./types.ts";

/** Real book quote fields required for CLV — never invent missing pieces. */
export type RealQuote = {
  book: string;
  market: Market;
  side: Side;
  line: number | null;
  price: number;
  capturedAt: string;
  source: OddsSnapshot["source"];
};

export type QuotePickRef = Pick<PickRow, "startAt" | "market" | "side" | "lockedLine">;

/**
 * Extract a real DraftKings quote (book / line / price / ts) from a snapshot JSON.
 * Returns null when any required field is missing, non-DK, post-tip, stale (>20m),
 * or the line no longer matches the locked ticket — never invents closes.
 */
export function extractRealQuote(raw: string | null | undefined, pick: QuotePickRef): RealQuote | null {
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw) as OddsSnapshot;
    if (!isDraftKingsLine(snap)) return null;
    const capturedAt = snap.capturedAt;
    if (!capturedAt || typeof capturedAt !== "string") return null;
    const time = Date.parse(capturedAt);
    const start = Date.parse(pick.startAt);
    if (!Number.isFinite(time) || !Number.isFinite(start)) return null;
    if (time >= start) return null;
    if (start - time > 20 * 60_000) return null;
    if (lineFor(snap, pick.market, pick.side) !== pick.lockedLine) return null;
    const price = priceFor(snap, pick.market, pick.side);
    if (price == null || !Number.isFinite(price) || price === 0) return null;
    const book = typeof snap.book === "string" && snap.book.trim() ? snap.book.trim() : null;
    if (!book) return null;
    return {
      book,
      market: pick.market,
      side: pick.side,
      line: pick.lockedLine,
      price: Math.round(price),
      capturedAt,
      source: snap.source,
    };
  } catch {
    return null;
  }
}

/** CLV is price-to-price on the SAME market/line, using the last verified pregame quote. */
export function verifiedClosingPrice(
  raw: string | null,
  pick: QuotePickRef,
): number | null {
  return extractRealQuote(raw, pick)?.price ?? null;
}

/** Ticket open = frozen posted/locked American; never invent a price. */
export function ticketOpenPrice(pick: {
  postedOdds?: number | null;
  lockedOdds: number;
}): number | null {
  const n = pick.postedOdds ?? pick.lockedOdds;
  return Number.isFinite(n) && n !== 0 ? Math.round(n) : null;
}

/**
 * Board open from the preserved first-seen DK open fields when present.
 * Incomplete for away ML / under — returns null rather than inventing.
 */
export function boardOpenPrice(snap: OddsSnapshot | null | undefined, market: Market, side: Side): number | null {
  if (!snap || !isDraftKingsLine(snap)) return null;
  if (market === "moneyline") {
    if (side === "home") return snap.openHomeMl != null && Number.isFinite(snap.openHomeMl) ? snap.openHomeMl : null;
    return null;
  }
  if (market === "total") {
    // openTotal is the line, not the juice — no board-open juice stored.
    return null;
  }
  if (market === "spread" && side === "home") {
    return null;
  }
  return null;
}

/** Implied-probability points: close − open. Positive = beat the close. Never invent. */
export function computeClvPoints(openPrice: number | null, closePrice: number | null): number | null {
  if (openPrice == null || closePrice == null) return null;
  if (!Number.isFinite(openPrice) || !Number.isFinite(closePrice) || openPrice === 0 || closePrice === 0) {
    return null;
  }
  return impliedFromAmerican(closePrice) - impliedFromAmerican(openPrice);
}

/**
 * Canonical open→close CLV for a ticket. Open = posted/locked only; close = verified real quote only.
 * Missing close ⇒ null CLV (never invented).
 */
export function ticketClvPoints(
  pick: { postedOdds?: number | null; lockedOdds: number },
  closePrice: number | null,
): number | null {
  return computeClvPoints(ticketOpenPrice(pick), closePrice);
}

export function formatClvPoints(clv: number | null | undefined): string {
  if (clv == null || !Number.isFinite(clv)) return "—";
  const pp = clv * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
}

export type OpenCloseLogInput = {
  selection: string;
  openPrice: number | null;
  closePrice: number | null;
  /** Hard LOCK vs soft desk — for labels only; never reclassifies. */
  pickTier?: "lock" | "soft_floor" | null;
  /** Optional real-quote provenance (book · line · ts) when close is real. */
  closeQuote?: Pick<RealQuote, "book" | "line" | "capturedAt"> | null;
};

/** One-line open→close log. Missing close stays "—" — never fabricates odds. */
export function formatOpenCloseLog(input: OpenCloseLogInput): string {
  const tier =
    input.pickTier === "soft_floor" ? "DESK" : input.pickTier === "lock" ? "LOCK" : "STRAIGHT";
  const open = formatAmerican(input.openPrice);
  const close = formatAmerican(input.closePrice);
  const clv = computeClvPoints(input.openPrice, input.closePrice);
  const clvLabel = clv == null ? "n/a (no real close)" : formatClvPoints(clv);
  const quoteBit =
    input.closeQuote && input.closePrice != null
      ? ` · ${input.closeQuote.book}` +
        (input.closeQuote.line != null ? ` line ${input.closeQuote.line}` : "") +
        ` @ ${input.closeQuote.capturedAt}`
      : "";
  return `CLV ${tier} · ${input.selection} · open ${open} → close ${close} · ${clvLabel}${quoteBit}`;
}

export type ClvRow = { clv: number | null };

export type ClvSummary = {
  sample: number;
  withClose: number;
  missingClose: number;
  beatClose: number;
  avgClv: number | null;
};

/** Aggregate CLV for straights with real closes only. */
export function summarizeClv(rows: ClvRow[]): ClvSummary {
  let withClose = 0;
  let beatClose = 0;
  let sum = 0;
  for (const row of rows) {
    if (row.clv == null || !Number.isFinite(row.clv)) continue;
    withClose += 1;
    sum += row.clv;
    if (row.clv > 0) beatClose += 1;
  }
  return {
    sample: rows.length,
    withClose,
    missingClose: rows.length - withClose,
    beatClose,
    avgClv: withClose > 0 ? sum / withClose : null,
  };
}

export function formatClvSummaryLine(summary: ClvSummary, label = "CLV"): string {
  if (summary.sample === 0) {
    return `📈 ${label}: **—** · no graded straights in window`;
  }
  if (summary.withClose === 0) {
    return `📈 ${label}: **—** · 0/${summary.sample} real closes (never invented)`;
  }
  return `📈 ${label}: **${formatClvPoints(summary.avgClv)}** avg · **${summary.beatClose}/${summary.withClose}** beat close · **${summary.missingClose}** missing close`;
}

export type ClosingCaptureAction = "use-cache" | "fetch" | "skip";

/**
 * Lean tip-window closing capture. Real DK quotes only.
 * FREE_BETA never fetches (no Odds burn); missing close stays missing.
 * Cache-first when a fresh pregame DK snapshot is already on hand.
 */
export function closingCaptureAction(input: {
  freeBeta: boolean;
  hasClosingSnapshot: boolean;
  cacheIsDk: boolean;
  cacheAgeMs: number | null;
  cacheBeforeStart: boolean;
}): ClosingCaptureAction {
  const cacheUsable =
    input.cacheIsDk &&
    input.cacheBeforeStart &&
    input.cacheAgeMs != null &&
    Number.isFinite(input.cacheAgeMs) &&
    input.cacheAgeMs >= 0 &&
    input.cacheAgeMs <= 20 * 60_000;

  if (cacheUsable) return "use-cache";
  if (input.freeBeta) return "skip";
  if (input.hasClosingSnapshot) return "skip";
  return "fetch";
}
