import assert from "node:assert/strict";
import { test } from "node:test";
import { applySportAdjust, assertNoLeakageInAdjust, sportHomeAdjust } from "./sport-adjust.ts";
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
  capturedAt: new Date().toISOString(),
};

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:adj",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    status: "scheduled",
    home: {
      name: "Dodgers",
      abbr: "LAD",
      logo: null,
      score: 12,
      record: "80-50",
      homeSplit: "45-20",
      roadSplit: "35-30",
      starter: { name: "Yamamoto", era: 2.8, whip: 0.95, savePct: null, position: "SP" },
    },
    away: {
      name: "Giants",
      abbr: "SF",
      logo: null,
      score: 1,
      record: "70-60",
      homeSplit: "38-28",
      roadSplit: "32-32",
      starter: { name: "Webb", era: 3.6, whip: 1.22, savePct: null, position: "SP" },
    },
    venue: "Dodger Stadium",
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: "68 F",
    injuriesFetchedAt: new Date().toISOString(),
    ...over,
  };
}

test("MLB WHIP and missing starter never use final scores", () => {
  const g = card();
  const adj = sportHomeAdjust(g);
  assert.ok(adj.delta > 0);
  assert.doesNotThrow(() => assertNoLeakageInAdjust(g));
  const missing = sportHomeAdjust(
    card({
      home: { ...g.home, starter: null },
      away: { ...g.away, starter: null },
    }),
  );
  assert.ok(missing.shrink > adj.shrink);
  assert.ok(missing.reasons.some((r) => /starter/i.test(r)));
});

test("NHL missing goalie shrinks hard toward the market", () => {
  const nhl = card({
    league: "nhl",
    sport: "NHL",
    home: { name: "Rangers", abbr: "NYR", logo: null, score: null, record: "20-10", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Bruins", abbr: "BOS", logo: null, score: null, record: "18-12", homeSplit: null, roadSplit: null, starter: null },
  });
  const applied = applySportAdjust(0.62, 0.52, nhl);
  assert.ok(applied.probability < 0.62);
  assert.ok(applied.adjust.shrink >= 0.5);
});

test("steam shrinks a hot line toward the current market", () => {
  const steamed = card({
    odds: { ...odds, openHomeMl: 120, homeMl: -150 },
  });
  const calm = sportHomeAdjust(card());
  const hot = sportHomeAdjust(steamed);
  assert.ok(hot.shrink > calm.shrink);
});
