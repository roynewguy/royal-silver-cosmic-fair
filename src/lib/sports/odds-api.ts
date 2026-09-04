import { LEAGUES } from "./leagues";
import { parseAmerican, parseLine } from "./odds";
import type { GameCard, OddsSnapshot } from "./types";

type OddsApiMarket = {
  key?: string;
  outcomes?: { name?: string; price?: number; point?: number }[];
};

type OddsApiGame = {
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: { key?: string; title?: string; markets?: OddsApiMarket[] }[];
};

const cache: { at: number; byLeague: Map<string, OddsApiGame[]> } = {
  at: 0,
  byLeague: new Map(),
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function snapshotFromApi(game: OddsApiGame, homeName: string, awayName: string): OddsSnapshot | null {
  const book = game.bookmakers?.[0];
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
    book: book.title ?? "DraftKings",
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

async function fetchLeagueOdds(sportKey: string, apiKey: string): Promise<OddsApiGame[]> {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("bookmakers", "draftkings");
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  return (await res.json()) as OddsApiGame[];
}

export async function mergeDraftKingsOdds(games: GameCard[]): Promise<GameCard[]> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) return games;
  const now = Date.now();
  if (now - cache.at > 8 * 60_000) {
    cache.byLeague = new Map();
    cache.at = now;
  }
  const byId = new Map(games.map((g) => [g.id, { ...g }]));
  const needed = LEAGUES.filter((l) => l.official && l.oddsApiKey);
  await Promise.allSettled(
    needed.map(async (league) => {
      if (!league.oddsApiKey) return;
      let rows = cache.byLeague.get(league.id);
      if (!rows) {
        rows = await fetchLeagueOdds(league.oddsApiKey, apiKey);
        cache.byLeague.set(league.id, rows);
      }
      for (const game of games.filter((g) => g.league === league.id)) {
        const hit = rows.find(
          (r) =>
            namesMatch(r.home_team ?? "", game.home.name) &&
            namesMatch(r.away_team ?? "", game.away.name),
        );
        if (!hit) continue;
        const snap = snapshotFromApi(hit, game.home.name, game.away.name);
        if (!snap) continue;
        const cur = byId.get(game.id);
        if (cur) byId.set(game.id, { ...cur, odds: { ...snap, openHomeSpread: cur.odds.openHomeSpread, openHomeMl: cur.odds.openHomeMl, openTotal: cur.odds.openTotal } });
      }
    }),
  );
  return [...byId.values()];
}
