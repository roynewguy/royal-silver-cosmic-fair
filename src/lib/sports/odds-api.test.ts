import assert from "node:assert/strict";
import { test } from "node:test";
import { isDraftKingsLine, pairOddsEvents } from "./odds-api.ts";
import type { OddsSnapshot } from "./types.ts";

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
      startAt: "2026-09-04T16:40:00Z",
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
