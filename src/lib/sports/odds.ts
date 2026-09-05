import { formatAmerican, formatLine } from "../utils.ts";
import type { Market, OddsSnapshot, Side } from "./types.ts";

export function parseAmerican(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^even$/i.test(s)) return 100;
  if (/^off$/i.test(s) || s === "-" || s === "—") return null;
  const n = Number(s.replace(/^\+/, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n);
}

export function parseLine(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw == null) return null;
  const s = String(raw).trim().replace(/^[ou]/i, "");
  if (!s) return null;
  const n = Number(s.replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
}

export function impliedFromAmerican(odds: number): number {
  if (odds < 0) return -odds / (-odds + 100);
  return 100 / (odds + 100);
}

export function devig(a: number, b: number): [number, number] {
  const ia = impliedFromAmerican(a);
  const ib = impliedFromAmerican(b);
  const s = ia + ib;
  if (s <= 0) return [0.5, 0.5];
  return [ia / s, ib / s];
}

export function twoWayMarket(a: number, b: number): {
  rawA: number;
  rawB: number;
  noVigA: number;
  noVigB: number;
  hold: number;
  vigAdjusted: true;
} {
  const rawA = impliedFromAmerican(a);
  const rawB = impliedFromAmerican(b);
  const [noVigA, noVigB] = devig(a, b);
  return { rawA, rawB, noVigA, noVigB, hold: rawA + rawB - 1, vigAdjusted: true };
}

export function oneWayMarket(price: number): {
  rawA: number;
  rawB: null;
  noVigA: null;
  noVigB: null;
  hold: null;
  vigAdjusted: false;
} {
  return {
    rawA: impliedFromAmerican(price),
    rawB: null,
    noVigA: null,
    noVigB: null,
    hold: null,
    vigAdjusted: false,
  };
}


export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function parseWinPct(summary: string | null | undefined): number | null {
  if (!summary) return null;
  const m = summary.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const w = Number(m[1]);
  const l = Number(m[2]);
  const t = w + l;
  if (t < 6) return null;
  return w / t;
}

export function selectionLabel(args: {
  market: Market;
  side: Side;
  homeAbbr: string;
  awayAbbr: string;
  line: number | null;
  price: number;
}): string {
  const { market, side, homeAbbr, awayAbbr, line, price } = args;
  const juice = formatAmerican(price);
  if (market === "moneyline") {
    const team = side === "home" ? homeAbbr : awayAbbr;
    return `${team} ML (${juice})`;
  }
  if (market === "total") {
    const dir = side === "over" ? "Over" : "Under";
    return `${dir} ${line ?? "—"} (${juice})`;
  }
  const team = side === "home" ? homeAbbr : awayAbbr;
  return `${team} ${formatLine(line)} (${juice})`;
}

export function hasUsableOdds(odds: OddsSnapshot): boolean {
  return (
    odds.homeMl != null ||
    odds.awayMl != null ||
    odds.homeSpread != null ||
    odds.total != null
  );
}

export function priceFor(odds: OddsSnapshot, market: Market, side: Side): number | null {
  if (market === "moneyline") return side === "home" ? odds.homeMl : odds.awayMl;
  if (market === "total") return side === "over" ? odds.overOdds : odds.underOdds;
  return side === "home" ? odds.homeSpreadOdds : odds.awaySpreadOdds;
}

export function lineFor(odds: OddsSnapshot, market: Market, side: Side): number | null {
  if (market === "total") return odds.total;
  if (market === "spread") return side === "home" ? odds.homeSpread : odds.awaySpread;
  return null;
}
