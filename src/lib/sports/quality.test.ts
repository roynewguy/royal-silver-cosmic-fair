import assert from "node:assert/strict";
import { test } from "node:test";
import { twoWayMarket, impliedFromAmerican } from "./odds.ts";
import { confidenceFrom, isPlayableRank, mlbDataQuality, sealRank, shouldAppendSnapshot } from "./data-quality.ts";
import { rankMlb } from "./models/mlb.ts";
import { MLB_V2_INPUTS } from "./mlb-inputs.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: "MIA +135",
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
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:mia",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    status: "scheduled",
    home: {
      name: "Marlins",
      abbr: "MIA",
      logo: null,
      score: null,
      record: "70-70",
      homeSplit: "40-31",
      roadSplit: null,
      starter: { name: "Junk", era: 4.1, whip: 1.2, savePct: null, position: "SP" },
    },
    away: {
      name: "Cubs",
      abbr: "CHC",
      logo: null,
      score: null,
      record: "80-60",
      homeSplit: null,
      roadSplit: "38-35",
      starter: { name: "Imanaga", era: 3.2, whip: 1.05, savePct: null, position: "SP" },
    },
    venue: "loanDepot",
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: "78° F, 8 mph",
    ...over,
  };
}

test("no-vig probabilities sum to 1 and hold is the juice", () => {
  const m = twoWayMarket(-150, 130);
  assert.ok(Math.abs(m.noVigA + m.noVigB - 1) < 1e-9);
  assert.ok(m.hold > 0);
  assert.ok(m.rawA + m.rawB > 1);
  assert.equal(m.vigAdjusted, true);
  assert.notEqual(m.noVigA, impliedFromAmerican(-150));
});

test("raw sportsbook implied is not labeled no-vig", () => {
  const r = sealRank(card(), {
    market: "moneyline",
    side: "home",
    selection: "MIA ML",
    line: null,
    price: 135,
    edgePct: 4,
    confidence: 0,
    why: "x",
    model: "v2-mlb",
    probability: 0.47,
    rawImplied: impliedFromAmerican(135),
    noVigImplied: null,
    vigAdjusted: false,
  });
  assert.equal(r?.vigAdjusted, false);
  assert.equal(r?.noVigImplied, null);
  assert.ok(r?.rawImplied != null);
});

test("missing starter reduces data quality and is not treated as zero ERA", () => {
  const full = mlbDataQuality(card());
  const missing = mlbDataQuality(
    card({
      home: { ...card().home, starter: null },
      away: { ...card().away, starter: null },
    }),
  );
  assert.ok(full.score - missing.score >= 20);
  assert.ok(missing.missing.includes("probable starters"));
  assert.ok(missing.missing.includes("starter ERA"));
  const pFull = rankMlb(card());
  const pMiss = rankMlb(
    card({
      home: { ...card().home, starter: null },
      away: { ...card().away, starter: null },
    }),
  );
  assert.ok((pMiss?.dataQuality ?? 0) < (pFull?.dataQuality ?? 100));
});

test("probability and confidence remain separate", () => {
  const r = rankMlb(card());
  assert.ok(r);
  assert.notEqual(Math.round(r!.probability * 100), r!.confidence);
  assert.equal(r!.model, "v2-mlb");
});

test("MLB weights stay the season W% + ERA + injury formula", () => {
  assert.ok(MLB_V2_INPUTS.productionWeightsFrozen[0].includes("0.16"));
  assert.ok(MLB_V2_INPUTS.missing.some((m) => m.input.includes("FIP")));
});

test("low data quality and missing starters near post become PASS reasons", () => {
  const weak = rankMlb(
    card({
      startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      home: { ...card().home, starter: null },
      away: { ...card().away, starter: null },
      weather: null,
    }),
  );
  assert.ok(weak?.passReason);
  assert.equal(isPlayableRank(weak), false);
});

test("stale DK capturedAt is PASS_STALE_MARKET", () => {
  const r = rankMlb(
    card({
      odds: { ...odds, capturedAt: new Date(Date.now() - 45 * 60_000).toISOString() },
    }),
  );
  assert.equal(r?.passReason, "PASS_STALE_MARKET");
  assert.equal(isPlayableRank(r), false);
});

test("candidate snapshots append and stay unofficial", () => {
  assert.equal(shouldAppendSnapshot(null, null, Date.now(), 0.5), true);
  const now = Date.now();
  assert.equal(shouldAppendSnapshot(now - 60_000, 0.5, now, 0.501), false);
  assert.equal(shouldAppendSnapshot(now - 60_000, 0.5, now, 0.52), true);
  assert.equal(shouldAppendSnapshot(now - 30 * 60_000, 0.5, now, 0.5), true);
});

test("confidenceFrom is not a copy of probability", () => {
  const c = confidenceFrom({ probability: 0.61, edgePct: 7, dataQuality: 55, missing: ["probable starters"] });
  assert.notEqual(c, 61);
  assert.ok(c < 58);
});
