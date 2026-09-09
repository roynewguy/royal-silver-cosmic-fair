import assert from "node:assert/strict";
import { test } from "node:test";
import { dropCorrelated, officialDecision, officialNoVigProbability, qualifyOfficial, sameTeam } from "./policy.ts";
import { canQueueOfficial } from "../models-v3/registry.ts";
import type { GameCard, OddsSnapshot, RankPick } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -110,
  awayMl: -110,
  homeSpread: -1.5,
  awaySpread: 1.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: -110,
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function rank(over: Partial<RankPick> = {}): RankPick {
  return {
    market: "moneyline",
    side: "home",
    selection: "LAD ML",
    line: null,
    price: -110,
    edgePct: 5,
    confidence: 70,
    why: "x",
    model: "v2-mlb",
    probability: 0.58,
    noVigImplied: 0.53,
    dataQuality: 88,
    missingInputs: [],
    passReason: null,
    ...over,
  };
}

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:1",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: "80-50", homeSplit: "42-20", roadSplit: "38-30", starter: { name: "A", era: 3.1, whip: 1.1, savePct: null, position: "SP" } },
    away: { name: "Giants", abbr: "SF", logo: null, score: null, record: "70-60", homeSplit: "38-28", roadSplit: "32-32", starter: { name: "B", era: 4.1, whip: 1.3, savePct: null, position: "SP" } },
    venue: "Dodger Stadium",
    odds,
    rank: rank(),
    notes: [],
    injuries: [],
    weather: "72 F",
    injuriesFetchedAt: new Date().toISOString(),
    ...over,
  };
}

test("V3 and V4 never qualify as official even with a fat edge", () => {
  assert.equal(canQueueOfficial("v3-mlb-logreg"), false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
  const v3 = card({ rank: rank({ model: "v3-mlb-logreg", edgePct: 12, probability: 0.64 }) });
  const v4 = card({ rank: rank({ model: "v4-mlb-ensemble", edgePct: 12, probability: 0.64 }) });
  assert.equal(qualifyOfficial(v3, 3, 58), false);
  assert.equal(qualifyOfficial(v4, 3, 58), false);
  assert.match(officialDecision(v3, 3, 58).detail, /not the live champion/);
});

test("V2 still qualifies when edge, EV, quality, and confidence clear", () => {
  assert.equal(qualifyOfficial(card(), 3, 58), true);
});

test("correlation drops the same-team second game", () => {
  const a = card({ id: "mlb:1" });
  const b = card({
    id: "mlb:2",
    home: { ...a.home, abbr: "LAD" },
    away: { name: "Padres", abbr: "SD", logo: null, score: null, record: "70-60", homeSplit: null, roadSplit: null, starter: null },
  });
  assert.equal(sameTeam(a, b), true);
  const { keep, dropped } = dropCorrelated([a, b]);
  assert.equal(keep.length, 1);
  assert.equal(dropped[0]?.id, "mlb:2");
});

test("soft-floor / always-pick is gone: a weak V2 play PASSes", () => {
  const weak = card({ rank: rank({ edgePct: 0.4, probability: 0.531, noVigImplied: 0.53, confidence: 59 }) });
  assert.equal(qualifyOfficial(weak, 3, 58), false);
  assert.equal(officialDecision(weak, 3, 58).action, "PASS");
});

test("official requires both sides of the no-vig market — no raw-implied fallback", () => {
  const oneSided = card({
    odds: { ...odds, awayMl: null },
    rank: rank({ noVigImplied: null, price: -200, probability: 0.72, edgePct: 8 }),
  });
  assert.equal(officialNoVigProbability(oneSided), null);
  const d = officialDecision(oneSided, 3, 58);
  assert.equal(d.action, "PASS");
  assert.equal(d.reason, "PASS_MARKET_INCOMPLETE");
  assert.equal(qualifyOfficial(oneSided, 3, 58), false);

  const storedButOneSided = card({
    odds: { ...odds, awayMl: null },
    rank: rank({ noVigImplied: 0.53, price: -200, probability: 0.72, edgePct: 8 }),
  });
  assert.equal(officialNoVigProbability(storedButOneSided), null);
  assert.equal(officialDecision(storedButOneSided, 3, 58).reason, "PASS_MARKET_INCOMPLETE");
});

test("complete two-way moneyline still qualifies V2", () => {
  const g = card();
  assert.ok(officialNoVigProbability(g) != null);
  assert.equal(qualifyOfficial(g, 3, 58), true);
});
