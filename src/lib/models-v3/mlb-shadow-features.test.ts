import assert from "node:assert/strict";
import { test } from "node:test";
import { mlbShadowFeatures } from "./mlb-shadow-features.ts";
import { canQueueOfficial } from "./registry.ts";
import type { GameCard, OddsSnapshot } from "../sports/types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -118,
  awayMl: -102,
  homeSpread: null,
  awaySpread: null,
  homeSpreadOdds: null,
  awaySpreadOdds: null,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: -110,
  source: "odds-api",
  capturedAt: "2026-09-09T12:00:00.000Z",
};

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:feat",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: "2026-09-09T20:00:00.000Z",
    status: "scheduled",
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: "80-50", homeSplit: "42-20", roadSplit: "38-30", starter: { name: "Yamamoto", era: 2.8, whip: 0.98, savePct: null, position: "SP" } },
    away: { name: "Giants", abbr: "SF", logo: null, score: null, record: "70-60", homeSplit: "38-28", roadSplit: "32-32", starter: { name: "Webb", era: 3.4, whip: 1.12, savePct: null, position: "SP" } },
    venue: "Dodger Stadium",
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: "70 F",
    ...over,
  };
}

test("shadow MLB features never invent FIP/xFIP/wRC+ and never use scores or close", () => {
  const f = mlbShadowFeatures(card());
  assert.ok(f.missing.includes("fip"));
  assert.ok(f.missing.includes("xfip"));
  assert.ok(f.missing.includes("wrc_plus"));
  assert.ok(f.missing.includes("handedness_splits"));
  assert.equal(f.eraHome, 2.8);
  assert.equal(f.whipHome, 0.98);
  assert.ok(f.lineMoveProb != null);
  assert.equal("homeScore" in f, false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
});

test("missing starters increase uncertainty instead of filling averages", () => {
  const full = mlbShadowFeatures(card());
  const thin = mlbShadowFeatures(card({
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Giants", abbr: "SF", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    weather: null,
    venue: null,
  }));
  assert.ok(thin.uncertaintyBump > full.uncertaintyBump);
  assert.ok(thin.missing.includes("starter_identity"));
});
