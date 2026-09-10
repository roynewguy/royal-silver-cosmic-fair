import assert from "node:assert/strict";
import { test } from "node:test";
import { buildYachtLiveSnapshot } from "./live-snapshot.ts";
import { twoWayPregame } from "./provenance.ts";
import type { GameCard, OddsSnapshot } from "../sports/types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: 135,
  awayMl: -155,
  homeSpread: 1.5,
  awaySpread: -1.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: 140,
  openAwayMl: -160,
  source: "odds-api",
  capturedAt: "2026-09-09T17:00:00.000Z",
};

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:live-yacht",
    espnId: "9",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Marlins", abbr: "MIA", logo: null, score: null, record: "70-70", homeSplit: null, roadSplit: null, starter: { name: "Junk", era: 4.1, whip: 1.2, savePct: null, position: "SP" } },
    away: { name: "Cubs", abbr: "CHC", logo: null, score: null, record: "80-60", homeSplit: null, roadSplit: null, starter: { name: "Shota", era: 3.2, whip: 1.1, savePct: null, position: "SP" } },
    venue: "loanDepot",
    odds,
    rank: { market: "moneyline", side: "home", selection: "MIA ML", line: null, price: 135, edgePct: 4, confidence: 62, why: "x", model: "v2-mlb", probability: 0.47 },
    notes: [],
    injuries: [],
    weather: "82 F",
    fetchedAt: "2026-09-09T17:00:00.000Z",
    startersFetchedAt: "2026-09-09T17:00:00.000Z",
    weatherFetchedAt: "2026-09-09T17:00:00.000Z",
    ...over,
  };
}

test("live Yacht snapshot keeps both opening and current sides", () => {
  const snap = buildYachtLiveSnapshot(card(), Date.parse("2026-09-09T17:05:00.000Z"));
  assert.ok(snap);
  assert.equal(snap!.market.homeOpen, 140);
  assert.equal(snap!.market.awayOpen, -160);
  assert.equal(snap!.market.homeCurrent, 135);
  assert.equal(snap!.market.awayCurrent, -155);
  assert.equal(snap!.market.homeClose, null);
  assert.equal(snap!.market.awayClose, null);
  const pair = twoWayPregame(snap!.market);
  assert.equal(pair?.home, 140);
  assert.equal(pair?.away, -160);
  assert.equal(snap!.features.some((f) => f.key === "FIP" && f.missing), true);
  assert.ok(Date.parse(snap!.predictionAt) < Date.parse(snap!.startAt));
  assert.equal(snap!.provenanceOk, true);
});

test("knownBeforeStart is not assumed — started games produce no snapshot", () => {
  const started = card({ startAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(buildYachtLiveSnapshot(started), null);
});

test("usable features must have known_at <= prediction_at", () => {
  const snap = buildYachtLiveSnapshot(card(), Date.parse("2026-09-09T17:05:00.000Z"));
  assert.ok(snap);
  for (const f of snap!.features) {
    if (!f.usable) continue;
    assert.ok(f.knownAt);
    assert.ok(Date.parse(f.knownAt!) <= Date.parse(snap!.predictionAt));
  }
});

test("all-null source timestamps stay unproven — predictionAt is not a substitute", () => {
  const blank = card({
    fetchedAt: undefined,
    startersFetchedAt: undefined,
    weatherFetchedAt: undefined,
    injuriesFetchedAt: undefined,
    weather: "82 F",
    odds: { ...odds, capturedAt: null },
  });
  const snap = buildYachtLiveSnapshot(blank, Date.parse("2026-09-09T17:05:00.000Z"));
  assert.ok(snap);
  assert.equal(snap!.market.capturedAt, null);
  assert.equal(snap!.market.openCapturedAt, null);
  assert.equal(snap!.provenanceOk, false);
  for (const f of snap!.features) {
    assert.equal(f.usable, false);
    assert.equal(f.knownAt, null);
  }
});

test("weather does not inherit board fetchedAt", () => {
  const snap = buildYachtLiveSnapshot(
    card({ weatherFetchedAt: undefined, weather: "82 F", fetchedAt: "2026-09-09T17:00:00.000Z" }),
    Date.parse("2026-09-09T17:05:00.000Z"),
  );
  assert.ok(snap);
  const weather = snap!.features.find((f) => f.key === "weather_string");
  assert.equal(weather?.knownAt, null);
  assert.equal(weather?.usable, false);
});
