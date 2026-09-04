import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFreezeSnapshot } from "./freeze.ts";
import type { OddsSnapshot, RankPick } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -130,
  awayMl: 110,
  homeSpread: -3,
  awaySpread: 3,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 44.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: null,
  source: "odds-api",
  capturedAt: "2026-09-04T00:00:00.000Z",
};

const rank: RankPick = {
  market: "spread",
  side: "home",
  selection: "SEA -3",
  line: -3,
  price: -110,
  edgePct: 4.2,
  confidence: 64,
  why: "test",
  model: "v2-nfl",
  probability: 0.57,
};

test("freeze snapshot keeps model version, probability, and edge", () => {
  const freeze = buildFreezeSnapshot({
    rank,
    units: 1,
    lockedOdds: -110,
    lockedLine: -3,
    selection: "SEA -3",
    gameId: "nfl:1",
    odds,
    frozenAt: "2026-09-04T18:00:00.000Z",
  });
  assert.equal(freeze.modelVersion, "v2-nfl");
  assert.equal(freeze.modelProbability, 0.57);
  assert.equal(freeze.modelEdge, 4.2);
  assert.equal(freeze.odds.book, "DraftKings");
  assert.equal(freeze.gameId, "nfl:1");
  const again = buildFreezeSnapshot({
    rank: { ...rank, probability: 0.99 },
    units: 2,
    lockedOdds: -105,
    lockedLine: -2.5,
    selection: "SEA -2.5",
    gameId: "nfl:1",
    odds,
    frozenAt: freeze.frozenAt,
  });
  assert.equal(freeze.modelProbability, 0.57);
  assert.notEqual(again.modelProbability, freeze.modelProbability);
});
