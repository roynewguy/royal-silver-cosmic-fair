import type { PickResult, PickRow } from "@/lib/sports/types";

/** Shown on every customer pick surface until a real official ticket exists. */
export const EMPTY_OFFICIAL_COPY = "No official plays right now.";

export const EMPTY_OFFICIAL_DETAIL =
  "The customer book only lists production locks after they are frozen and posted.";

/** Exact keys allowed on a customer-facing pick. Anything else is a leak. */
export const ALLOWED_CUSTOMER_PICK_KEYS = [
  "awayAbbr",
  "awayLogo",
  "clv",
  "gradedAt",
  "homeAbbr",
  "homeLogo",
  "id",
  "league",
  "line",
  "market",
  "matchup",
  "postedAt",
  "price",
  "profitUnits",
  "result",
  "selection",
  "side",
  "sport",
  "startAt",
  "units",
] as const;

export type CustomerPick = {
  id: number;
  sport: string;
  league: string;
  matchup: string;
  market: string;
  selection: string;
  side: string;
  line: number | null;
  price: number;
  units: number;
  result: PickResult | null;
  profitUnits: number | null;
  startAt: string;
  postedAt: string;
  gradedAt: string | null;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  clv: number | null;
};

export type PublicRecord = {
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  units: number;
  pending: number;
  playCount: number;
  roi: number | null;
  avgClv: number | null;
};

export type OfficialBook = {
  live: CustomerPick[];
  history: CustomerPick[];
  record: PublicRecord;
  empty: boolean;
  emptyCopy: string;
};

const RESEARCH_VERSION_RE = /(^|[^a-z0-9])(v3|v4|yacht|shadow|soak|paper)([^a-z0-9]|$)/i;

export function isResearchModelVersion(version: string | null | undefined): boolean {
  if (!version) return false;
  return RESEARCH_VERSION_RE.test(version);
}

/**
 * Hard gate: a row may enter the customer book only when it is an official,
 * auto, posted-or-graded production ticket with an official key, and is not a
 * V3/V4/Yacht/shadow/soak/paper artifact.
 */
export function isOfficialCustomerPick(row: {
  ledger?: string | null;
  status?: string | null;
  pickSource?: string | null;
  officialKey?: string | null;
  modelVersion?: string | null;
}): boolean {
  if ((row.ledger ?? "official") !== "official") return false;
  if (row.status !== "posted" && row.status !== "graded") return false;
  if ((row.pickSource ?? "auto") !== "auto") return false;
  if (!row.officialKey) return false;
  if (isResearchModelVersion(row.modelVersion)) return false;
  return true;
}

export function toCustomerPick(row: PickRow): CustomerPick | null {
  if (!isOfficialCustomerPick(row)) return null;
  const postedAt = row.postedAt ?? row.createdAt;
  if (!postedAt) return null;
  const price = row.postedOdds ?? row.lockedOdds;
  if (!Number.isFinite(price)) return null;
  return {
    id: row.id,
    sport: row.sport,
    league: row.league,
    matchup: row.matchup,
    market: row.market,
    selection: row.selection,
    side: row.side,
    line: row.lockedLine,
    price: Math.round(price),
    units: row.units,
    result: row.status === "graded" ? row.result : null,
    profitUnits: row.status === "graded" ? row.profitUnits : null,
    startAt: row.startAt,
    postedAt,
    gradedAt: row.status === "graded" ? row.gradedAt : null,
    homeAbbr: row.homeAbbr,
    awayAbbr: row.awayAbbr,
    homeLogo: row.homeLogo,
    awayLogo: row.awayLogo,
    clv: row.status === "graded" ? row.clv : null,
  };
}

export function customerPickKeys(pick: CustomerPick): string[] {
  return Object.keys(pick).sort();
}

export function assertCustomerSafe(payload: unknown): void {
  if (payload == null) return;
  if (Array.isArray(payload)) {
    for (const item of payload) assertCustomerSafe(item);
    return;
  }
  if (typeof payload !== "object") return;
  const keys = Object.keys(payload);
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      lower.includes("paper") ||
      lower.includes("shadow") ||
      lower.includes("soak") ||
      lower.includes("yacht") ||
      lower.includes("would_have") ||
      lower.includes("wouldhave") ||
      lower === "modelversion" ||
      lower === "modelprobability" ||
      lower === "modeledge" ||
      lower === "freezejson" ||
      lower === "research" ||
      lower === "discordmessage" ||
      lower === "discordmessageid" ||
      lower === "skipreason" ||
      lower === "ledger" ||
      lower === "officialkey" ||
      lower === "edgepct" ||
      lower === "confidence" ||
      lower === "picksource"
    ) {
      throw new Error(`customer payload leaked key: ${key}`);
    }
  }
}

export function summarizeOfficial(picks: CustomerPick[]): PublicRecord {
  const graded = picks.filter((p) => p.result != null);
  const decided = graded.filter((p) => p.result === "WIN" || p.result === "LOSS");
  const units = graded.reduce((sum, p) => sum + (p.profitUnits ?? 0), 0);
  const risked = decided.reduce((sum, p) => sum + p.units, 0);
  const clvs = graded.map((p) => p.clv).filter((n): n is number => n != null);
  return {
    wins: graded.filter((p) => p.result === "WIN").length,
    losses: graded.filter((p) => p.result === "LOSS").length,
    pushes: graded.filter((p) => p.result === "PUSH").length,
    voids: graded.filter((p) => p.result === "VOID").length,
    units,
    pending: picks.filter((p) => p.result == null).length,
    playCount: picks.length,
    roi: risked > 0 ? units / risked : null,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
  };
}

export function buildOfficialBook(rows: PickRow[]): OfficialBook {
  const picks = rows
    .map(toCustomerPick)
    .filter((p): p is CustomerPick => p != null)
    .sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt));
  for (const pick of picks) assertCustomerSafe(pick);
  const live = picks.filter((p) => p.result == null);
  const history = picks.filter((p) => p.result != null);
  return {
    live,
    history,
    record: summarizeOfficial(picks),
    empty: picks.length === 0,
    emptyCopy: EMPTY_OFFICIAL_COPY,
  };
}
