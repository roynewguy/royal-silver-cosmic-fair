import { applyDraftKingsSnapshot, nearestKickHours, shouldFetchLeagueOdds } from "./dk-open.ts";
import { isFreeBetaMode } from "./free-beta.ts";
import { LEAGUES } from "./leagues.ts";
import { parseAmerican, parseLine } from "./odds.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

type OddsApiMarket = {
  key?: string;
  outcomes?: { name?: string; price?: number; point?: number }[];
};

export type OddsApiGame = {
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: { key?: string; title?: string; markets?: OddsApiMarket[] }[];
};

const cache: { byLeague: Map<string, { at: number; rows: OddsApiGame[] }> } = {
  byLeague: new Map(),
};

const MAX_START_DELTA_MS = 4 * 60 * 60 * 1000;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function isDraftKingsLine(odds: OddsSnapshot): boolean {
  if (odds.source !== "odds-api") return false;
  return /draft\s*kings/i.test(odds.book);
}

export function pairOddsEvents(
  games: { id: string; home: string; away: string; startAt: string }[],
  events: { home_team?: string; away_team?: string; commence_time?: string }[],
  maxDeltaMs = MAX_START_DELTA_MS,
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

function snapshotFromApi(game: OddsApiGame, homeName: string, awayName: string): OddsSnapshot | null {
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
    capturedAt: new Date().toISOString(),
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

export function oddsApiUrl(sportKey: string, apiKey: string, markets: string): string {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", markets);
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("bookmakers", "draftkings");
  return url.toString();
}

export async function fetchDraftKingsMarket(
  sportKey: string,
  apiKey: string,
  markets: string,
): Promise<{ rows: OddsApiGame[]; usage: OddsUsage }> {
  const res = await fetch(oddsApiUrl(sportKey, apiKey, markets), { signal: AbortSignal.timeout(8000) });
  const usage = parseUsageHeaders(res.headers);
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  return { rows: (await res.json()) as OddsApiGame[], usage };
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
      const leagueGames = games.filter((g) => g.league === league.id && g.status === "scheduled");
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
      });
      if (!needFetch && cached) {
        applyPairs(leagueGames, cached.rows, byId);
        return;
      }
      const { rows } = await fetchDraftKingsMarket(league.oddsApiKey, apiKey, "h2h,spreads,totals");
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
    byId.set(gameId, { ...cur, odds: applyDraftKingsSnapshot(cur.odds, snap) });
  }
}
