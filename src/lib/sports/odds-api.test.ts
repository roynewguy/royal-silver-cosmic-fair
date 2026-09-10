import assert from "node:assert/strict";
import { test } from "node:test";
import { isDraftKingsLine, pairOddsEvents, matchSingleOddsEvent, fetchDraftKingsMarket, mergeDraftKingsOdds, oddsApiUrl, oddsHttpCalls, resetOddsApiCaches, seedLeagueOddsCache } from "./odds-api.ts";
import { OFFICIAL_BOOKS, RESEARCH_BOOKS } from "./odds-poll.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

test("doubleheader pairs each ESPN game to the closer commence_time", () => {
  const games = [
    {
      id: "mlb:g1",
      home: "Los Angeles Dodgers",
      away: "San Diego Padres",
      startAt: "2026-09-04T16:10:00Z",
    },
    {
      id: "mlb:g2",
      home: "Los Angeles Dodgers",
      away: "San Diego Padres",
      startAt: "2026-09-04T23:10:00Z",
    },
  ];
  const events = [
    {
      home_team: "Los Angeles Dodgers",
      away_team: "San Diego Padres",
      commence_time: "2026-09-04T23:11:00Z",
    },
    {
      home_team: "Los Angeles Dodgers",
      away_team: "San Diego Padres",
      commence_time: "2026-09-04T16:12:00Z",
    },
  ];
  const pairs = pairOddsEvents(games, events);
  assert.equal(pairs.get("mlb:g1"), 1);
  assert.equal(pairs.get("mlb:g2"), 0);
  assert.equal(pairs.size, 2);
});

test("does not reuse one Odds API event for two games", () => {
  const games = [
    {
      id: "mlb:g1",
      home: "Los Angeles Dodgers",
      away: "San Diego Padres",
      startAt: "2026-09-04T16:10:00Z",
    },
    {
      id: "mlb:g2",
      home: "Los Angeles Dodgers",
      away: "San Diego Padres",
      startAt: "2026-09-04T16:20:00Z",
    },
  ];
  const events = [
    {
      home_team: "Los Angeles Dodgers",
      away_team: "San Diego Padres",
      commence_time: "2026-09-04T16:10:00Z",
    },
  ];
  const pairs = pairOddsEvents(games, events);
  assert.equal(pairs.size, 1);
  assert.equal(pairs.get("mlb:g1"), 0);
  assert.equal(pairs.has("mlb:g2"), false);
});

test("rejects a commence_time more than 4 hours off", () => {
  const pairs = pairOddsEvents(
    [
      {
        id: "mlb:g1",
        home: "Los Angeles Dodgers",
        away: "San Diego Padres",
        startAt: "2026-09-04T16:10:00Z",
      },
    ],
    [
      {
        home_team: "Los Angeles Dodgers",
        away_team: "San Diego Padres",
        commence_time: "2026-09-04T22:10:00Z",
      },
    ],
  );
  assert.equal(pairs.size, 0);
});

test("isDraftKingsLine requires Odds API + DraftKings book", () => {
  const base: OddsSnapshot = {
    book: "DraftKings",
    details: null,
    homeMl: -110,
    awayMl: -110,
    homeSpread: null,
    awaySpread: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null,
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: null,
    source: "odds-api",
    capturedAt: null,
  };
  assert.equal(isDraftKingsLine(base), true);
  assert.equal(isDraftKingsLine({ ...base, source: "espn" }), false);
  assert.equal(isDraftKingsLine({ ...base, book: "ESPN BET" }), false);
});

test("official matching PASSes when two Odds events fit the same ESPN game", () => {
  const match = matchSingleOddsEvent(
    {
      home: "Los Angeles Dodgers",
      away: "San Diego Padres",
      startAt: "2026-09-04T16:10:00Z",
    },
    [
      { home_team: "Los Angeles Dodgers", away_team: "San Diego Padres", commence_time: "2026-09-04T16:05:00Z" },
      { home_team: "Los Angeles Dodgers", away_team: "San Diego Padres", commence_time: "2026-09-04T16:20:00Z" },
    ],
  );
  assert.equal(match.ok, false);
  if (!match.ok) assert.equal(match.reason, "PASS_ODDS_EVENT_AMBIGUOUS");
});

test("official matching PASSes swapped teams and far commence times", () => {
  const swapped = matchSingleOddsEvent(
    { home: "Miami Marlins", away: "Chicago Cubs", startAt: "2026-09-04T23:10:00Z" },
    [{ home_team: "Chicago Cubs", away_team: "Miami Marlins", commence_time: "2026-09-04T23:10:00Z" }],
  );
  assert.equal(swapped.ok, false);
  const far = matchSingleOddsEvent(
    { home: "Los Angeles Dodgers", away: "San Diego Padres", startAt: "2026-09-04T16:10:00Z" },
    [{ home_team: "Los Angeles Dodgers", away_team: "San Diego Padres", commence_time: "2026-09-04T18:10:00Z" }],
  );
  assert.equal(far.ok, false);
  if (!far.ok) assert.equal(far.reason, "PASS_START_TIME_MISMATCH");
});

function headers(last = "3"): Headers {
  return new Headers({
    "x-requests-remaining": "400",
    "x-requests-used": "20",
    "x-requests-last": last,
  });
}

function dkEvent(startAt: string) {
  return {
    id: "ev1",
    sport_key: "baseball_mlb",
    home_team: "Los Angeles Dodgers",
    away_team: "San Diego Padres",
    commence_time: startAt,
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        last_update: new Date().toISOString(),
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Los Angeles Dodgers", price: -150 },
              { name: "San Diego Padres", price: 130 },
            ],
          },
        ],
      },
    ],
  };
}

function mlbGame(over: Partial<GameCard> = {}): GameCard {
  const startAt = over.startAt ?? new Date(Date.now() + 2 * 3600_000).toISOString();
  return {
    id: "mlb:1",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt,
    status: "scheduled",
    home: {
      name: "Los Angeles Dodgers",
      abbr: "LAD",
      logo: null,
      score: null,
      record: "80-60",
      homeSplit: null,
      roadSplit: null,
      starter: null,
    },
    away: {
      name: "San Diego Padres",
      abbr: "SD",
      logo: null,
      score: null,
      record: "70-70",
      homeSplit: null,
      roadSplit: null,
      starter: null,
    },
    venue: "Dodger Stadium",
    odds: {
      book: "ESPN",
      details: null,
      homeMl: -140,
      awayMl: 120,
      homeSpread: null,
      awaySpread: null,
      homeSpreadOdds: null,
      awaySpreadOdds: null,
      total: null,
      overOdds: null,
      underOdds: null,
      openHomeSpread: null,
      openTotal: null,
      openHomeMl: null,
      source: "espn",
      capturedAt: null,
    },
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

test("official odds URL is DraftKings-only; research URL keeps consensus books", () => {
  const official = oddsApiUrl("baseball_mlb", "k", "h2h", OFFICIAL_BOOKS);
  assert.match(official, /bookmakers=draftkings/);
  assert.doesNotMatch(official, /fanduel/);
  const research = oddsApiUrl("baseball_mlb", "k", "h2h,totals", RESEARCH_BOOKS);
  assert.match(research, /fanduel/);
  assert.match(research, /draftkings/);
});

test("duplicate Odds API requests in one tick are coalesced", async () => {
  resetOddsApiCaches();
  let calls = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return new Response(JSON.stringify([dkEvent(new Date(Date.now() + 2 * 3600_000).toISOString())]), {
      status: 200,
      headers: headers("2"),
    });
  }) as typeof fetch;
  try {
    const [a, b] = await Promise.all([
      fetchDraftKingsMarket("baseball_mlb", "k", "h2h"),
      fetchDraftKingsMarket("baseball_mlb", "k", "h2h"),
    ]);
    const c = await fetchDraftKingsMarket("baseball_mlb", "k", "h2h");
    assert.equal(calls, 1);
    assert.equal(oddsHttpCalls(), 1);
    assert.equal(a.rows.length, 1);
    assert.equal(b.rows.length, 1);
    assert.equal(c.rows.length, 1);
    assert.equal(c.usage.last, 0);
  } finally {
    globalThis.fetch = orig;
    resetOddsApiCaches();
  }
});

test("no-games and completed slates do not hit the Odds API", async () => {
  resetOddsApiCaches();
  const prevKey = process.env.ODDS_API_KEY;
  const prevBeta = process.env.FREE_BETA_MODE;
  process.env.ODDS_API_KEY = "test-key";
  delete process.env.FREE_BETA_MODE;
  let calls = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("odds fetch should not run");
  }) as typeof fetch;
  try {
    await mergeDraftKingsOdds([mlbGame({ status: "final" })]);
    await mergeDraftKingsOdds([mlbGame({ status: "cancelled" })]);
    await mergeDraftKingsOdds([mlbGame({ status: "postponed" })]);
    assert.equal(calls, 0);
    assert.equal(oddsHttpCalls(), 0);
  } finally {
    globalThis.fetch = orig;
    resetOddsApiCaches();
    if (prevKey === undefined) delete process.env.ODDS_API_KEY;
    else process.env.ODDS_API_KEY = prevKey;
    if (prevBeta === undefined) delete process.env.FREE_BETA_MODE;
    else process.env.FREE_BETA_MODE = prevBeta;
  }
});

test("distant cached games skip a scan fetch; near-start still refreshes", async () => {
  resetOddsApiCaches();
  const prevKey = process.env.ODDS_API_KEY;
  const prevBeta = process.env.FREE_BETA_MODE;
  process.env.ODDS_API_KEY = "test-key";
  delete process.env.FREE_BETA_MODE;
  let calls = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify([dkEvent(new Date(Date.now() + 2 * 3600_000).toISOString())]), {
      status: 200,
      headers: headers("1"),
    });
  }) as typeof fetch;
  try {
    seedLeagueOddsCache("mlb", [dkEvent(new Date(Date.now() + 20 * 3600_000).toISOString())], Date.now() - 30 * 60_000);
    await mergeDraftKingsOdds([mlbGame({ startAt: new Date(Date.now() + 20 * 3600_000).toISOString() })]);
    assert.equal(calls, 0);
    resetOddsApiCaches();
    seedLeagueOddsCache("mlb", [dkEvent(new Date(Date.now() + 2 * 3600_000).toISOString())], Date.now() - 9 * 60_000);
    await mergeDraftKingsOdds([mlbGame({ startAt: new Date(Date.now() + 2 * 3600_000).toISOString() })]);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = orig;
    resetOddsApiCaches();
    if (prevKey === undefined) delete process.env.ODDS_API_KEY;
    else process.env.ODDS_API_KEY = prevKey;
    if (prevBeta === undefined) delete process.env.FREE_BETA_MODE;
    else process.env.FREE_BETA_MODE = prevBeta;
  }
});

