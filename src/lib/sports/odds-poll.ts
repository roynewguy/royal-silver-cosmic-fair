import { inWindow } from "./espn.ts";
import { LEAGUE_BY_ID } from "./leagues.ts";
import { MAX_OFFICIAL_DK_CACHE_AGE_MS, officialLineDecision, type OfficialDkAction } from "./free-beta.ts";
import type { GameCard, GameStatus, Market, SportId } from "./types.ts";

/** Scan lookahead for Odds API — same 3-day cap as ESPN `inLookahead`. */
export const ODDS_LOOKAHEAD_HOURS = 72;

export const POLL_CADENCE_MS = {
  /** <3h, including the freeze/truth-gate window. Matches prior high-frequency scan. */
  high: 8 * 60_000,
  /** 3–12h */
  medium: 30 * 60_000,
  /** >12h but still inside the lookahead window */
  low: 120 * 60_000,
} as const;

export const OFFICIAL_BOOKS = "draftkings";
export const RESEARCH_BOOKS = "draftkings,fanduel,betmgm,williamhill_us";

export const QUOTA_WARNING_REMAINING = 150;
export const QUOTA_CRITICAL_REMAINING = 50;

export type QuotaLevel = "ok" | "warning" | "critical" | "exhausted";

export type OddsPollBand = "none" | "low" | "medium" | "high";

export type OddsTelemetry = {
  remaining: number | null;
  used: number | null;
  last: number | null;
  tickUsed: number;
  tickRequests: number;
  bySport: Record<string, number>;
  dayKey: string;
  dayUsed: number;
  estimatedDailyBurn: number;
  estimatedMonthlyBurn: number;
  quotaLevel: QuotaLevel;
  updatedAt: string;
};

const TERMINAL_STATUS: ReadonlySet<GameStatus> = new Set(["final", "cancelled", "postponed"]);

export function quotaLevel(remaining: number | null | undefined): QuotaLevel {
  if (remaining == null) return "ok";
  if (remaining <= 0) return "exhausted";
  if (remaining < QUOTA_CRITICAL_REMAINING) return "critical";
  if (remaining <= QUOTA_WARNING_REMAINING) return "warning";
  return "ok";
}

export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function pollBand(hoursToKick: number | null | undefined): OddsPollBand {
  if (hoursToKick == null || hoursToKick < 0) return "none";
  if (hoursToKick > ODDS_LOOKAHEAD_HOURS) return "none";
  if (hoursToKick <= 3) return "high";
  if (hoursToKick <= 12) return "medium";
  return "low";
}

export function pollCadenceMs(hoursToKick: number | null | undefined): number | null {
  const band = pollBand(hoursToKick);
  if (band === "none") return null;
  return POLL_CADENCE_MS[band];
}

export function shouldFetchLeagueOdds(input: {
  scheduledCount: number;
  hoursToKick: number | null;
  lastFetchAgeMs: number;
  inLookahead?: boolean;
}): boolean {
  if (input.scheduledCount <= 0) return false;
  if (input.inLookahead === false) return false;
  const cadence = pollCadenceMs(input.hoursToKick);
  if (cadence == null) return false;
  return input.lastFetchAgeMs >= cadence;
}

export function isEligibleOddsGame(game: Pick<GameCard, "status" | "startAt" | "league">, now = Date.now()): boolean {
  if (game.status !== "scheduled") return false;
  if (TERMINAL_STATUS.has(game.status)) return false;
  const start = new Date(game.startAt).getTime();
  if (!Number.isFinite(start) || start <= now) return false;
  const hours = (start - now) / 3_600_000;
  if (hours > ODDS_LOOKAHEAD_HOURS) return false;
  return inWindow(game as GameCard, LEAGUE_BY_ID[game.league as SportId]?.lookAheadDays ?? 3, now);
}

export function nearestKickHours(starts: string[], now = Date.now()): number | null {
  let best: number | null = null;
  for (const start of starts) {
    const t = new Date(start).getTime();
    if (Number.isNaN(t)) continue;
    const hours = (t - now) / 3_600_000;
    if (best == null || hours < best) best = hours;
  }
  return best;
}

/** Markets V2 actually ranks for this league. Extra markets burn Odds API credits. */
export function scanMarketsForLeague(leagueId: SportId): string {
  switch (leagueId) {
    case "ufc":
      return "h2h";
    case "mlb":
    case "nhl":
      return "h2h,totals";
    default:
      return "h2h,spreads,totals";
  }
}

export function officialMarkets(market: Market): "h2h" | "spreads" | "totals" {
  if (market === "moneyline") return "h2h";
  if (market === "total") return "totals";
  return "spreads";
}

export function marketsCover(cached: string, needed: string): boolean {
  const have = new Set(cached.split(",").map((m) => m.trim()).filter(Boolean));
  return needed
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .every((m) => have.has(m));
}

export function booksCover(cached: string, needed: string): boolean {
  const have = new Set(cached.split(",").map((b) => b.trim()).filter(Boolean));
  return needed
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean)
    .every((b) => have.has(b));
}

/**
 * Official LOCK: fresh DK cache may be reused; stale cache never freezes;
 * exhausted quota cannot fetch and cannot substitute stale market data.
 */
export function officialLockMarketAction(input: {
  remaining: number | null;
  cacheAgeMs: number | null;
  cachedIsDk: boolean;
  checksAlready?: number;
  fetchOk?: boolean;
}): OfficialDkAction {
  return officialLineDecision(input);
}

export function quotaBlocksOfficialLock(input: {
  remaining: number | null;
  cacheAgeMs: number | null;
  cachedIsDk: boolean;
}): boolean {
  return officialLockMarketAction(input) === "pass";
}

export function emptyTelemetry(now = Date.now()): OddsTelemetry {
  return {
    remaining: null,
    used: null,
    last: null,
    tickUsed: 0,
    tickRequests: 0,
    bySport: {},
    dayKey: utcDayKey(now),
    dayUsed: 0,
    estimatedDailyBurn: 0,
    estimatedMonthlyBurn: 0,
    quotaLevel: "ok",
    updatedAt: new Date(now).toISOString(),
  };
}

export function parseOddsTelemetry(raw: unknown, now = Date.now()): OddsTelemetry {
  const fallback = emptyTelemetry(now);
  if (!raw) return fallback;
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return fallback;
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else {
    return fallback;
  }
  const num = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const bySport: Record<string, number> = {};
  if (obj.bySport && typeof obj.bySport === "object" && !Array.isArray(obj.bySport)) {
    for (const [k, v] of Object.entries(obj.bySport as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) bySport[k] = n;
    }
  }
  const remaining = num(obj.remaining);
  return {
    remaining,
    used: num(obj.used),
    last: num(obj.last),
    tickUsed: Math.max(0, num(obj.tickUsed) ?? 0),
    tickRequests: Math.max(0, num(obj.tickRequests) ?? 0),
    bySport,
    dayKey: typeof obj.dayKey === "string" && obj.dayKey ? obj.dayKey : utcDayKey(now),
    dayUsed: Math.max(0, num(obj.dayUsed) ?? 0),
    estimatedDailyBurn: Math.max(0, num(obj.estimatedDailyBurn) ?? 0),
    estimatedMonthlyBurn: Math.max(0, num(obj.estimatedMonthlyBurn) ?? 0),
    quotaLevel: quotaLevel(remaining),
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date(now).toISOString(),
  };
}

function projectDaily(dayUsed: number, now: number): number {
  const elapsedMs = now - Date.parse(`${utcDayKey(now)}T00:00:00.000Z`);
  const elapsedHours = Math.max(elapsedMs / 3_600_000, 1 / 12);
  return (dayUsed / elapsedHours) * 24;
}

function projectMonthly(used: number | null, remaining: number | null, estimatedDaily: number, now: number): number {
  if (used != null && used >= 0) {
    const day = new Date(now).getUTCDate();
    const days = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 0)).getUTCDate();
    return (used / Math.max(day, 1)) * days;
  }
  if (remaining != null && remaining >= 0) return estimatedDaily * 30;
  return estimatedDaily * 30;
}

export function foldUsage(
  prev: OddsTelemetry | null | undefined,
  event: {
    remaining: number | null;
    used: number | null;
    last: number | null;
    sportKey?: string | null;
    now?: number;
  },
): OddsTelemetry {
  const now = event.now ?? Date.now();
  const base = parseOddsTelemetry(prev ?? emptyTelemetry(now), now);
  const dayKey = utcDayKey(now);
  const last = event.last != null && Number.isFinite(event.last) ? Math.max(0, event.last) : 0;
  const dayUsed = (base.dayKey === dayKey ? base.dayUsed : 0) + last;
  const tickUsed = base.tickUsed + last;
  const tickRequests = base.tickRequests + (event.last != null ? 1 : 0);
  const bySport = { ...base.bySport };
  if (event.sportKey && last) {
    bySport[event.sportKey] = (bySport[event.sportKey] ?? 0) + last;
  }
  const remaining = event.remaining ?? base.remaining;
  const used = event.used ?? base.used;
  const estimatedDailyBurn = projectDaily(dayUsed, now);
  return {
    remaining,
    used,
    last: event.last ?? base.last,
    tickUsed,
    tickRequests,
    bySport,
    dayKey,
    dayUsed,
    estimatedDailyBurn,
    estimatedMonthlyBurn: projectMonthly(used, remaining, estimatedDailyBurn, now),
    quotaLevel: quotaLevel(remaining),
    updatedAt: new Date(now).toISOString(),
  };
}

export function formatOddsSummary(t: OddsTelemetry): string {
  const sports =
    Object.entries(t.bySport)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ") || "none";
  const remaining = t.remaining == null ? "—" : String(t.remaining);
  return `${remaining} remaining · ${t.tickUsed} this tick · ~${Math.round(t.estimatedDailyBurn)}/day · ~${Math.round(t.estimatedMonthlyBurn)}/month · ${t.quotaLevel} · ${sports}`;
}

export function beginTickTelemetry(prev: OddsTelemetry | null | undefined, now = Date.now()): OddsTelemetry {
  const parsed = parseOddsTelemetry(prev ?? emptyTelemetry(now), now);
  const dayKey = utcDayKey(now);
  return {
    ...parsed,
    tickUsed: 0,
    tickRequests: 0,
    bySport: {},
    dayKey,
    dayUsed: parsed.dayKey === dayKey ? parsed.dayUsed : 0,
    quotaLevel: quotaLevel(parsed.remaining),
    updatedAt: new Date(now).toISOString(),
  };
}

/** Stale DK must never freeze. Freshness window is unchanged (20 min). */
export function cacheSatisfiesOfficial(cacheAgeMs: number | null | undefined, cachedIsDk: boolean): boolean {
  if (!cachedIsDk) return false;
  return cacheAgeMs != null && cacheAgeMs >= 0 && cacheAgeMs <= MAX_OFFICIAL_DK_CACHE_AGE_MS;
}
