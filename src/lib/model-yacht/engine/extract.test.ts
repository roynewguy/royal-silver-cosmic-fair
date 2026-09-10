import assert from "node:assert/strict";
import { test } from "node:test";
import { YACHT_SPORTS } from "../core/versioning.ts";
import { sourceClock, sourceProvenanceOk } from "./clocks.ts";
import { extractGameWarehouse, observationHasForbiddenFeature } from "./extract.ts";
import { trueOpener } from "./opener.ts";
import type { YachtQuote } from "./types.ts";
import type { GameCard, OddsSnapshot } from "../../sports/types.ts";

const collectedAt = "2026-09-09T17:10:00.000Z";

function odds(over: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    book: "DraftKings",
    details: null,
    homeMl: -140,
    awayMl: 120,
    homeSpread: -3,
    awaySpread: 3,
    homeSpreadOdds: -110,
    awaySpreadOdds: -110,
    total: 44.5,
    overOdds: -110,
    underOdds: -110,
    openHomeSpread: -3,
    openTotal: 44,
    openHomeMl: -135,
    openAwayMl: 115,
    source: "odds-api",
    capturedAt: "2026-09-09T17:00:00.000Z",
    ...over,
  };
}

function card(league: string, over: Partial<GameCard> = {}): GameCard {
  return {
    id: `${league}:engine`,
    espnId: "1",
    sport: league.toUpperCase(),
    league,
    startAt: "2026-09-09T20:00:00.000Z",
    status: "scheduled",
    home: { name: "Home", abbr: "HOM", logo: null, score: null, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Away", abbr: "AWY", logo: null, score: null, record: "0-1", homeSplit: null, roadSplit: null, starter: null },
    venue: "Park",
    odds: odds(),
    rank: { market: "moneyline", side: "home", selection: "HOM ML", line: null, price: -140, edgePct: 4, confidence: 60, why: "x", model: "v2-mlb", probability: 0.55 },
    notes: [],
    injuries: [],
    weather: "70 F",
    fetchedAt: "2026-09-09T17:00:00.000Z",
    startersFetchedAt: "2026-09-09T17:00:00.000Z",
    weatherFetchedAt: "2026-09-09T17:00:00.000Z",
    injuriesFetchedAt: "2026-09-09T17:00:00.000Z",
    ...over,
  } as GameCard;
}

test("sourceClock never invents now or a sibling feed", () => {
  assert.equal(sourceClock(null), null);
  assert.equal(sourceClock(undefined), null);
  assert.equal(sourceClock(""), null);
  assert.equal(sourceClock("not-a-clock"), null);
  assert.equal(sourceClock("2026-09-09T17:00:00.000Z"), "2026-09-09T17:00:00.000Z");
});

test("future timestamps are unproven", () => {
  assert.equal(
    sourceProvenanceOk({ knownAt: "2026-09-09T18:00:00.000Z", collectedAt: "2026-09-09T17:10:00.000Z" }),
    false,
  );
  assert.equal(
    sourceProvenanceOk({ knownAt: "2026-09-09T21:00:00.000Z", collectedAt, startAt: "2026-09-09T20:00:00.000Z" }),
    false,
  );
});

test("all eight sports extract without fabricating advanced stats", () => {
  for (const sport of YACHT_SPORTS) {
    const extracted = extractGameWarehouse(card(sport), collectedAt);
    assert.ok(extracted, sport);
    assert.equal(extracted!.sport, sport);
    assert.ok(extracted!.observations.length >= 6, sport);
    assert.ok(extracted!.quotes.some((q) => q.role === "current" && q.side === "home"), sport);
    assert.equal(extracted!.observations.some(observationHasForbiddenFeature), false, sport);
    const blob = JSON.stringify(extracted);
    assert.equal(blob.includes("EPA"), false, sport);
    assert.equal(blob.includes("xG"), false, sport);
    assert.equal(blob.includes("KenPom"), false, sport);
    assert.equal(blob.includes("FIP"), false, sport);
    assert.equal(blob.includes("fighter striking"), false, sport);
    assert.equal(extracted!.observations.some((o) => "predictionAt" in (o.payload as object)), false, sport);
  }
});

test("non-yacht sports are not collected", () => {
  assert.equal(extractGameWarehouse(card("mls"), collectedAt), null);
  assert.equal(extractGameWarehouse(card("epl"), collectedAt), null);
});

test("missing timestamps stay unproven and do not inherit another feed", () => {
  const extracted = extractGameWarehouse(
    card("nfl", {
      weatherFetchedAt: undefined,
      injuriesFetchedAt: undefined,
      startersFetchedAt: undefined,
      fetchedAt: "2026-09-09T17:00:00.000Z",
      odds: odds({ capturedAt: "2026-09-09T17:00:00.000Z" }),
    }),
    collectedAt,
  );
  assert.ok(extracted);
  const weather = extracted!.observations.find((o) => o.kind === "weather");
  const injuries = extracted!.observations.find((o) => o.kind === "injuries");
  const starters = extracted!.observations.find((o) => o.kind === "starters");
  const market = extracted!.observations.find((o) => o.kind === "market");
  assert.equal(weather?.knownAt, null);
  assert.equal(weather?.provenanceOk, false);
  assert.equal(injuries?.knownAt, null);
  assert.equal(starters?.knownAt, null);
  assert.equal(market?.knownAt, "2026-09-09T17:00:00.000Z");
  assert.equal(market?.provenanceOk, true);
  assert.equal(JSON.stringify(market?.payload).includes("openHomeMl"), false);
});

test("unparseable and post-start clocks stay unproven", () => {
  const extracted = extractGameWarehouse(
    card("nba", {
      weatherFetchedAt: "not-a-clock",
      injuriesFetchedAt: "2026-09-09T20:30:00.000Z",
    }),
    "2026-09-09T21:30:00.000Z",
  );
  assert.ok(extracted);
  const weather = extracted!.observations.find((o) => o.kind === "weather");
  const injuries = extracted!.observations.find((o) => o.kind === "injuries");
  assert.equal(weather?.knownAt, null);
  assert.equal(weather?.provenanceOk, false);
  assert.equal(injuries?.knownAt, "2026-09-09T20:30:00.000Z");
  assert.equal(injuries?.provenanceOk, false);
});

test("future quote timestamps are unproven and are not openers", () => {
  const extracted = extractGameWarehouse(
    card("mlb", { odds: odds({ capturedAt: "2026-09-09T18:00:00.000Z" }) }),
    collectedAt,
  );
  assert.ok(extracted);
  const current = extracted!.quotes.find((q) => q.role === "current" && q.market === "moneyline" && q.side === "home");
  assert.equal(current?.capturedAt, "2026-09-09T18:00:00.000Z");
  assert.equal(current?.provenanceOk, false);
  assert.equal(trueOpener(extracted!.quotes, { sportsbook: "DraftKings", market: "moneyline", side: "home" }), null);
});

test("consensus books do not inherit DraftKings capturedAt", () => {
  const extracted = extractGameWarehouse(
    card("nba", {
      shadows: {
        consensus: {
          books: [{ sportsbook: "FanDuel", key: "fanduel", homePrice: -130, awayPrice: 110 }],
          bestHome: -130,
          bestAway: 110,
          consensusHome: -130,
          medianHome: -130,
          noVigHome: 0.54,
          dispersion: 0.01,
        },
      },
    }),
    collectedAt,
  );
  assert.ok(extracted);
  const fd = extracted!.quotes.find((q) => q.sportsbook === "FanDuel" && q.side === "home");
  assert.ok(fd);
  assert.equal(fd!.capturedAt, null);
  assert.equal(fd!.provenanceOk, false);
  const dk = extracted!.quotes.find((q) => q.sportsbook === "DraftKings" && q.role === "current" && q.side === "home");
  assert.equal(dk?.capturedAt, "2026-09-09T17:00:00.000Z");
  assert.equal(dk?.provenanceOk, true);
});

test("numeric claimed open without timestamp is not a true opener", () => {
  const extracted = extractGameWarehouse(card("mlb"), collectedAt);
  assert.ok(extracted);
  const claimed = extracted!.quotes.find((q) => q.role === "open_claimed" && q.side === "home");
  assert.equal(claimed?.price, -135);
  assert.equal(claimed?.capturedAt, null);
  assert.equal(claimed?.provenanceOk, false);
  const opener = trueOpener(extracted!.quotes, { sportsbook: "DraftKings", market: "moneyline", side: "home" });
  assert.ok(opener);
  assert.equal(opener!.role, "current");
  assert.equal(opener!.price, -140);
});

test("close quotes never become features or openers", () => {
  const extracted = extractGameWarehouse(card("mlb"), collectedAt)!;
  const close: YachtQuote = {
    ...extracted.quotes[0]!,
    quoteId: "close-test",
    role: "close",
    evaluationOnly: true,
    provenanceOk: false,
    capturedAt: "2026-09-09T19:55:00.000Z",
    price: -200,
  };
  const opener = trueOpener([...extracted.quotes, close], {
    sportsbook: close.sportsbook,
    market: close.market,
    side: close.side,
  });
  assert.ok(opener);
  assert.notEqual(opener!.role, "close");
  assert.equal(opener!.evaluationOnly, false);
  assert.equal(extracted.quotes.some((q) => q.role === "close" || q.evaluationOnly), false);
});

test("scores and closes stay out of prediction observations", () => {
  const extracted = extractGameWarehouse(
    card("nhl", {
      status: "final",
      home: { name: "Home", abbr: "HOM", logo: null, score: 4, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
      away: { name: "Away", abbr: "AWY", logo: null, score: 2, record: "0-1", homeSplit: null, roadSplit: null, starter: null },
    }),
    collectedAt,
  );
  assert.ok(extracted);
  assert.equal(extracted!.evalFacts.some((f) => f.kind === "score"), true);
  assert.equal(extracted!.evalFacts.some((f) => f.kind === "result"), true);
  for (const obs of extracted!.observations) {
    const blob = JSON.stringify(obs.payload);
    assert.equal(blob.includes('"homeScore"'), false);
    assert.equal(blob.includes("clv"), false);
    assert.equal(blob.includes("homeClose"), false);
    assert.equal(observationHasForbiddenFeature(obs), false);
  }
});

test("idempotent ids are stable for the same observation", () => {
  const a = extractGameWarehouse(card("ncaaf"), collectedAt)!;
  const b = extractGameWarehouse(card("ncaaf"), collectedAt)!;
  assert.deepEqual(
    a.observations.map((o) => o.observationId),
    b.observations.map((o) => o.observationId),
  );
  assert.deepEqual(
    a.quotes.map((q) => q.quoteId),
    b.quotes.map((q) => q.quoteId),
  );
});
