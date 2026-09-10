import assert from "node:assert/strict";
import { test } from "node:test";
import { canQueueOfficial, isProductionModel, isShadowModel } from "./registry.ts";
import { promoteChallenger, rollbackToV2 } from "./promotion.ts";
import { livePostingEnabled } from "../desk/production-policy.ts";
import { selectFreePickOfDay } from "../sports/free-pick.ts";
import { qualifyOfficial } from "../sports/policy.ts";
import type { GameCard, OddsSnapshot, RankPick } from "../sports/types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -150,
  awayMl: 130,
  homeSpread: -1.5,
  awaySpread: 1.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: -140,
  source: "odds-api",
  capturedAt: "2026-09-09T12:00:00.000Z",
};

function rank(over: Partial<RankPick> = {}): RankPick {
  return {
    market: "moneyline",
    side: "home",
    selection: "LAD ML",
    line: null,
    price: -150,
    edgePct: 8,
    confidence: 72,
    why: "x",
    model: "v2-mlb",
    probability: 0.62,
    noVigImplied: 0.54,
    dataQuality: 90,
    passReason: null,
    pickTier: "lock",
    ...over,
  };
}

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:safe",
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

test("V3 and V4 are shadow and can never queue official", () => {
  assert.equal(isProductionModel("v2-mlb"), true);
  assert.equal(isShadowModel("v3-mlb-logreg"), true);
  assert.equal(isShadowModel("v4-mlb-ensemble"), true);
  assert.equal(canQueueOfficial("v3-mlb-logreg"), false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
  assert.equal(canQueueOfficial("v2-mlb"), true);
});

test("promotion never enables live posting", () => {
  const fat = { n: 500, brier: 0.18, roi: 0.08, clv: 0.02, calibrationDelta: 0.01, maxDrawdown: -4 };
  const champ = { n: 500, brier: 0.22, roi: 0.01, clv: 0.005, calibrationDelta: 0.02, maxDrawdown: -6 };
  const promoted = promoteChallenger({ version: "v3-mlb-logreg", sport: "mlb", stats: fat, champion: champ, confirmLive: true });
  assert.equal(promoted.livePosting, false);
  assert.equal(promoted.ok, false);
  assert.equal(rollbackToV2("mlb").livePosting, false);
  assert.equal(livePostingEnabled({}), false);
});

test("V3/V4 ranks never qualify as official LOCK", () => {
  const v3 = card({ rank: rank({ model: "v3-mlb-logreg" }) });
  const v4 = card({ rank: rank({ model: "v4-mlb-ensemble" }) });
  assert.equal(qualifyOfficial(v3, 3, 58), false);
  assert.equal(qualifyOfficial(v4, 3, 58), false);
});

test("free picks stay LOCK-only and never fall back to DESK", () => {
  assert.equal(selectFreePickOfDay([{ id: 1, status: "posted", edgePct: 9, tier: "soft_floor" }]), null);
  assert.equal(selectFreePickOfDay([]), null);
  const lock = selectFreePickOfDay([{ id: 2, status: "posted", edgePct: 4, tier: "lock" }]);
  assert.equal(lock?.id, 2);
});
