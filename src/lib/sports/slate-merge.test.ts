import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeFetchedSlate } from "./slate-merge.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -120,
  awayMl: 100,
  homeSpread: -1.5,
  awaySpread: 1.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: -1.5,
  openTotal: 8.5,
  openHomeMl: -120,
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function card(over: Partial<GameCard>): GameCard {
  return {
    id: "x",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: "80-60", homeSplit: "42-28", roadSplit: "38-32", starter: null },
    away: { name: "Giants", abbr: "SF", logo: null, score: null, record: "70-70", homeSplit: "38-32", roadSplit: "32-38", starter: null },
    venue: null,
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

test("empty ESPN tick keeps the last saved league slate", () => {
  const prev = [card({ id: "mlb:1", league: "mlb", sport: "MLB" })];
  const next = mergeFetchedSlate([], prev);
  assert.equal(next.some((g) => g.id === "mlb:1"), true);
});

test("a fetched league replaces that league only", () => {
  const now = Date.now();
  const kick = new Date(now + 3600_000).toISOString();
  const freshNba = card({
    id: "nba:fresh",
    league: "nba",
    sport: "NBA",
    startAt: kick,
    home: { name: "Lakers", abbr: "LAL", logo: null, score: null, record: "10-4", homeSplit: "6-1", roadSplit: "4-3", starter: null },
    away: { name: "Suns", abbr: "PHX", logo: null, score: null, record: "8-6", homeSplit: "5-2", roadSplit: "3-4", starter: null },
  });
  const oldNba = card({ id: "nba:old", league: "nba", sport: "NBA", startAt: kick });
  const oldMlb = card({ id: "mlb:1", league: "mlb", sport: "MLB", startAt: kick });
  const next = mergeFetchedSlate([freshNba], [oldNba, oldMlb], now);
  assert.equal(next.some((g) => g.id === "nba:fresh"), true);
  assert.equal(next.some((g) => g.id === "nba:old"), false);
  assert.equal(next.some((g) => g.id === "mlb:1"), true);
});
