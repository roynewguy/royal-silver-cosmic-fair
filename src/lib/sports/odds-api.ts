import { applyDraftKingsSnapshot } from "./dk-open.ts";
import { isFreeBetaMode } from "./free-beta.ts";
import { LEAGUES } from "./leagues.ts";
import { parseAmerican, parseLine } from "./odds.ts";
import { buildMarketConsensus, quotesFromEvent } from "./market-consensus.ts";
import {
  OFFICIAL_BOOKS,
  RESEARCH_BOOKS,
  beginTickTelemetry,
  booksCover,
  emptyTelemetry,
  foldUsage,
  isEligibleOddsGame,
  marketsCover,
  nearestKickHours,
  quotaLevel,
  scanMarketsForLeague,
  shouldFetchLeagueOdds,
  type OddsTelemetry,
} from "./odds-poll.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";
import { oddsApiGameOk, oddsApiListOk } from "./schema-guard.ts";

type OddsApiMarket = {
  key?: string;
  outcomes?: { name?: string; price?: number; point?: number }[];
};

export type OddsApiGame = {
  id?: string;
  sport_key?: string;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: { key?: string; title?: string; last_update?: string; markets?: OddsApiMarket[] }[];
};

const cache: { byLeague: Map<string, { at: number; rows: OddsApiGame[] }> } = {
  byLeague: new Map(),
};

type RecentOdds = {
  at: number;
  rows: OddsApiGame[];
  usage: OddsUsage;
  markets: string;
  books: string;
  sportKey: string;
};

const inflight = new Map<string, Promise<{ rows: OddsApiGame[]; usage: OddsUsage }>>();
const recent = new Map<string, RecentOdds>();

let httpCalls = 0;
let tickTelemetry: OddsTelemetry | null = null;

export const SCAN_START_DELTA_MS = 4 * 60 * 60 * 1000;
export const OFFICIAL_START_DELTA_MS = 15 * 60 * 1000;
/** Same-tick reuse only. Official freeze never treats this as a 20-minute truth-gate cache. */
export const COALESCE_MAX_AGE_MS = 60_000;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function teamsSwapped(
  event: { home_team?: string; away_team?: string },
  game: { home: string; away: string },
): boolean {
  return namesMatch(event.home_team ?? "", game.away) && namesMatch(event.away_team ?? "", game.home);
}

export type OddsMatchResult =
  | { ok: true; index: number }
  | { ok: false; reason: "PASS_ODDS_EVENT_AMBIGUOUS" | "PASS_GAME_MISMATCH" | "PASS_START_TIME_MISMATCH" | "PASS_DK_UNAVAILABLE" };

export function matchSingleOddsEvent(
  game: { home: string; away: string; startAt: string },
  events: { home_team?: string; away_team?: string; commence_time?: string }[],
  maxDeltaMs = OFFICIAL_START_DELTA_MS,
): OddsMatchResult {
  const start = new Date(game.startAt).getTime();
  if (Number.isNaN(start)) return { ok: false, reason: "PASS_START_TIME_MISMATCH" };
  const named: number[] = [];
  const swapped: number[] = [];
  const timed: { i: number; delta: number }[] = [];
  events.forEach((event, i) => {
    if (teamsSwapped(event, game)) swapped.push(i);
    const homeOk = namesMatch(event.home_team ?? "", game.home);
    const awayOk = namesMatch(event.away_team ?? "", game.away);
    if (!homeOk || !awayOk) return;
    named.push(i);
    const commence = new Date(event.commence_time ?? "").getTime();
    if (Number.isNaN(commence)) return;
    const delta = Math.abs(commence - start);
    if (delta <= maxDeltaMs) timed.push({ i, delta });
  });
  if (swapped.length && !timed.length) return { ok: false, reason: "PASS_GAME_MISMATCH" };
  if (timed.length > 1) return { ok: false, reason: "PASS_ODDS_EVENT_AMBIGUOUS" };
  if (timed.length === 1) return { ok: true, index: timed[0]!.i };
  if (named.length) return { ok: false, reason: "PASS_START_TIME_MISMATCH" };
  return { ok: false, reason: "PASS_DK_UNAVAILABLE" };
}

export function isDraftKingsLine(odds: OddsSnapshot): boolean {
  if (odds.source !== "odds-api") return false;
  return /draft\s*kings/i.test(odds.book);
}

export function pairOddsEvents(
  games: { id: string; home: string; away: string; startAt: string }[],
  events: { home_team?: string; away_team?: string; commence_time?: string }[],
  maxDeltaMs = SCAN_START_DELTA_MS,
): Map<string, number> {
  const used = new Set<number>();
  const out = new Map<string, number>();
  const ordered = [...games].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  for (const game of ordered) {
    const start = new Date(game.startAt).getTime();
    if (Number.isNaN(start)) continue;
    let best = -1;
    let bestDelta = Infinity;
    events.forEach((event, i) => {
      if (used.has(i)) return;
      if (!namesMatch(event.home_team ?? "", game.home)) return;
      if (!namesMatch(event.away_team ?? "", game.away)) return;
      const commence = new Date(event.commence_time ?? "").getTime();
      if (Number.isNaN(commence)) return;
      const delta = Math.abs(commence - start);
      if (delta < bestDelta) {
        best = i;
        bestDelta = delta;
      }
    });
    if (best >= 0 && bestDelta <= maxDeltaMs) {
      used.add(best);
      out.set(game.id, best);
    }
  }
  return out;
}

export function snapshotFromApi(game: OddsApiGame, homeName: string, awayName: string): OddsSnapshot | null {
  const book = game.bookmakers?.find((b) => /draftkings/i.test(`${b.key ?? ""} ${b.title ?? ""}`));
  if (!book) return null;
  const markets = book.markets ?? [];
  const h2h = markets.find((m) => m.key === "h2h");
  const spreads = markets.find((m) => m.key === "spreads");
  const totals = markets.find((m) => m.key === "totals");
  const homeMl = h2h?.outcomes?.find((o) => namesMatch(o.name ?? "", homeName))?.price ?? null;
  const awayMl = h2h?.outcomes?.find((o) => namesMatch(o.name ?? "", awayName))?.price ?? null;
  const homeSp = spreads?.outcomes?.find((o) => namesMatch(o.name ?? "", homeName));
  const awaySp = spreads?.outcomes?.find((o) => namesMatch(o.name ?? "", awayName));
  const over = totals?.outcomes?.find((o) => /^over$/i.test(o.name ?? ""));
  const under = totals?.outcomes?.find((o) => /^under$/i.test(o.name ?? ""));
  if (homeMl == null && homeSp == null && over == null) return null;
  if (homeSp && awaySp && homeSp.point !== -Number(awaySp.point)) return null;
  if (over && under && over.point !== under.point) return null;
  return {
    book: book.title || "DraftKings",
    details: null,
    homeMl: parseAmerican(homeMl),
    awayMl: parseAmerican(awayMl),
    homeSpread: parseLine(homeSp?.point),
    awaySpread: parseLine(awaySp?.point),
    homeSpreadOdds: parseAmerican(homeSp?.price),
    awaySpreadOdds: parseAmerican(awaySp?.price),
    total: parseLine(over?.point ?? under?.point),
    overOdds: parseAmerican(over?.price),
    underOdds: parseAmerican(under?.price),
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: null,
    source: "odds-api",
    capturedAt: book.last_update ?? null,
    eventId: game.id ?? null,
    eventStartAt: game.commence_time ?? null,
    sportKey: game.sport_key ?? null,
  };
}

export type OddsUsage = {
  remaining: number | null;
  used: number | null;
  last: number | null;
};

export function parseUsageHeaders(headers: { get: (name: string) => string | null }): OddsUsage {
  const num = (k: string) => {
    const v = headers.get(k);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    remaining: num("x-requests-remaining"),
    used: num("x-requests-used"),
    last: num("x-requests-last"),
  };
}

export function oddsApiUrl(
  sportKey: string,
  apiKey: string,
  markets: string,
  books: string = OFFICIAL_BOOKS,
): string {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", markets);
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("bookmakers", books);
  return url.toString();
}

function requestKey(sportKey: string, markets: string, books: string): string {
  return `${sportKey}|${markets}|${books}`;
}

function findReusable(
  sportKey: string,
  markets: string,
  books: string,
  maxAgeMs: number,
  now = Date.now(),
): RecentOdds | null {
  let best: RecentOdds | null = null;
  for (const entry of recent.values()) {
    if (entry.sportKey !== sportKey) continue;
    if (now - entry.at > maxAgeMs) continue;
    if (!marketsCover(entry.markets, markets)) continue;
    if (!booksCover(entry.books, books)) continue;
    if (!best || entry.at > best.at) best = entry;
  }
  return best;
}

function rememberRecent(
  sportKey: string,
  markets: string,
  books: string,
  rows: OddsApiGame[],
  usage: OddsUsage,
  now = Date.now(),
): void {
  recent.set(requestKey(sportKey, markets, books), { at: now, rows, usage, markets, books, sportKey });
}

function noteSpend(sportKey: string, usage: OddsUsage): void {
  if (!tickTelemetry) tickTelemetry = emptyTelemetry();
  tickTelemetry = foldUsage(tickTelemetry, {
    remaining: usage.remaining,
    used: usage.used,
    last: usage.last,
    sportKey,
  });
}

export function beginOddsTick(): void {
  httpCalls = 0;
  inflight.clear();
  tickTelemetry = beginTickTelemetry(tickTelemetry ?? emptyTelemetry());
}

export function oddsTickStats(): {
  httpCalls: number;
  tickUsed: number;
  tickRequests: number;
  bySport: Record<string, number>;
  remaining: number | null;
  quotaLevel: ReturnType<typeof quotaLevel>;
} {
  return {
    httpCalls,
    tickUsed: tickTelemetry?.tickUsed ?? 0,
    tickRequests: tickTelemetry?.tickRequests ?? 0,
    bySport: { ...(tickTelemetry?.bySport ?? {}) },
    remaining: tickTelemetry?.remaining ?? null,
    quotaLevel: quotaLevel(tickTelemetry?.remaining ?? null),
  };
}

export function currentOddsTelemetry(): OddsTelemetry | null {
  return tickTelemetry;
}

export function seedOddsTelemetry(t: OddsTelemetry | null): void {
  tickTelemetry = t;
}

export function oddsHttpCalls(): number {
  return httpCalls;
}

export function seedLeagueOddsCache(leagueId: string, rows: OddsApiGame[], at = Date.now()): void {
  cache.byLeague.set(leagueId, { at, rows });
}

export function resetOddsApiCaches(): void {
  cache.byLeague.clear();
  inflight.clear();
  recent.clear();
  httpCalls = 0;
  tickTelemetry = null;
}

async function fetchOddsHttp(
  sportKey: string,
  apiKey: string,
  markets: string,
  books: string,
): Promise<{ rows: OddsApiGame[]; usage: OddsUsage }> {
  httpCalls += 1;
  const res = await fetch(oddsApiUrl(sportKey, apiKey, markets, books), { signal: AbortSignal.timeout(8000) });
  const usage = parseUsageHeaders(res.headers);
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  const payload = await res.json();
  const list = oddsApiListOk(payload);
  if (!list.ok) throw new Error(`Odds API schema: ${list.detail}`);
  const rows = (payload as OddsApiGame[]).filter((row) => oddsApiGameOk(row).ok);
  noteSpend(sportKey, usage);
  return { rows, usage };
}

export async function fetchDraftKingsMarket(
  sportKey: string,
  apiKey: string,
  markets: string,
  books: string = OFFICIAL_BOOKS,
): Promise<{ rows: OddsApiGame[]; usage: OddsUsage }> {
  const now = Date.now();
  const reused = findReusable(sportKey, markets, books, COALESCE_MAX_AGE_MS, now);
  if (reused) return { rows: reused.rows, usage: { remaining: reused.usage.remaining, used: reused.usage.used, last: 0 } };
  const key = requestKey(sportKey, markets, books);
  const pending = inflight.get(key);
  if (pending) return pending;
  const work = fetchOddsHttp(sportKey, apiKey, markets, books)
    .then((result) => {
      rememberRecent(sportKey, markets, books, result.rows, result.usage);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, work);
  return work;
}

export function overlayDraftKings(game: GameCard, event: OddsApiGame): GameCard | null {
  const snap = snapshotFromApi(event, game.home.name, game.away.name);
  if (!snap) return null;
  return { ...game, odds: applyDraftKingsSnapshot(game.odds, snap) };
}

export async function mergeDraftKingsOdds(games: GameCard[]): Promise<GameCard[]> {
  if (isFreeBetaMode()) return games;
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) return games;
  const now = Date.now();
  const byId = new Map(games.map((g) => [g.id, { ...g }]));
  const needed = LEAGUES.filter((l) => l.official && l.oddsApiKey);
  await Promise.allSettled(
    needed.map(async (league) => {
      if (!league.oddsApiKey) return;
      const leagueGames = games.filter((g) => g.league === league.id && isEligibleOddsGame(g, now));
      if (leagueGames.length === 0) return;
      const cached = cache.byLeague.get(league.id);
      const hours = nearestKickHours(
        leagueGames.map((g) => g.startAt),
        now,
      );
      const lastAge = cached ? now - cached.at : Number.POSITIVE_INFINITY;
      const needFetch = shouldFetchLeagueOdds({
        scheduledCount: leagueGames.length,
        hoursToKick: hours,
        lastFetchAgeMs: lastAge,
        inLookahead: true,
      });
      if (!needFetch && cached) {
        applyPairs(leagueGames, cached.rows, byId);
        return;
      }
      const markets = scanMarketsForLeague(league.id);
      const { rows } = await fetchDraftKingsMarket(league.oddsApiKey, apiKey, markets, RESEARCH_BOOKS);
      cache.byLeague.set(league.id, { at: now, rows });
      applyPairs(leagueGames, rows, byId);
    }),
  );
  return [...byId.values()];
}

function applyPairs(leagueGames: GameCard[], rows: OddsApiGame[], byId: Map<string, GameCard>) {
  const pairs = pairOddsEvents(
    leagueGames.map((g) => ({
      id: g.id,
      home: g.home.name,
      away: g.away.name,
      startAt: g.startAt,
    })),
    rows,
  );
  for (const [gameId, eventIndex] of pairs) {
    const hit = rows[eventIndex];
    const cur = byId.get(gameId);
    if (!hit || !cur) continue;
    const snap = snapshotFromApi(hit, cur.home.name, cur.away.name);
    if (!snap) continue;
    const quotes = quotesFromEvent(hit, cur.home.name, cur.away.name);
    const consensus = buildMarketConsensus(quotes);
    byId.set(gameId, {
      ...cur,
      odds: applyDraftKingsSnapshot(cur.odds, snap),
      shadows: { ...cur.shadows, consensus },
    });
  }
}

export { OFFICIAL_BOOKS, RESEARCH_BOOKS };
