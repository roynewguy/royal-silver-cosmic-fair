import assert from "node:assert/strict";
import { test } from "node:test";
import { canQueueOfficial, isProductionModel, isShadowModel, isYachtModel, PRODUCTION_MODELS } from "../models-v3/registry.ts";
import { promoteChallenger } from "../models-v3/promotion.ts";
import { qualifyOfficial } from "../sports/policy.ts";
import { selectFreePickOfDay } from "../sports/free-pick.ts";
import { MODEL_YACHT_MLB_CONTRACT, MODEL_YACHT_PUBLIC_NAME } from "./names.ts";
import {
  assertYachtShadowOnly,
  yachtCanAutoPromote,
  yachtCanChangePublicRecord,
  yachtCanFreezeOfficial,
  yachtCanPostFreeDiscord,
  yachtCanPostOfficialDiscord,
  yachtCanQueueOfficial,
  yachtRank,
} from "./safety.ts";
import type { GameCard, OddsSnapshot } from "../sports/types.ts";

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
  openAwayMl: 120,
  source: "odds-api",
  capturedAt: "2026-09-09T12:00:00.000Z",
};

function card(): GameCard {
  return {
    id: "mlb:yacht",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: "80-50", homeSplit: "42-20", roadSplit: "38-30", starter: { name: "A", era: 3.1, whip: 1.1, savePct: null, position: "SP" } },
    away: { name: "Giants", abbr: "SF", logo: null, score: null, record: "70-60", homeSplit: "38-28", roadSplit: "32-32", starter: { name: "B", era: 4.1, whip: 1.3, savePct: null, position: "SP" } },
    venue: "Dodger Stadium",
    odds,
    rank: yachtRank(),
    notes: [],
    injuries: [],
    weather: "72 F",
    injuriesFetchedAt: new Date().toISOString(),
  };
}

test("public name is Model Yacht — never V5/V6/V7", () => {
  assert.equal(MODEL_YACHT_PUBLIC_NAME, "Model Yacht");
  assert.equal(MODEL_YACHT_MLB_CONTRACT.startsWith("model-yacht-"), true);
  assert.equal(/v[5-9]/i.test(MODEL_YACHT_MLB_CONTRACT), false);
});

test("Yacht cannot queue official tickets", () => {
  assert.equal(isYachtModel(MODEL_YACHT_MLB_CONTRACT), true);
  assert.equal(isShadowModel(MODEL_YACHT_MLB_CONTRACT), true);
  assert.equal(isProductionModel(MODEL_YACHT_MLB_CONTRACT), false);
  assert.equal(canQueueOfficial(MODEL_YACHT_MLB_CONTRACT), false);
  assert.equal(yachtCanQueueOfficial(), false);
  assert.equal(PRODUCTION_MODELS.mlb, "v2-mlb");
});

test("Yacht cannot freeze official tickets", () => {
  assert.equal(yachtCanFreezeOfficial(), false);
});

test("Yacht cannot post official Discord", () => {
  assert.equal(yachtCanPostOfficialDiscord(MODEL_YACHT_MLB_CONTRACT, { BOATBOYZ_LIVE_POSTING: "true" }), false);
});

test("Yacht cannot post free Discord", () => {
  assert.equal(yachtCanPostFreeDiscord(), false);
  assert.equal(selectFreePickOfDay([{ id: 1, status: "posted", edgePct: 12, tier: "soft_floor" }]), null);
});

test("Yacht cannot change public record", () => {
  assert.equal(yachtCanChangePublicRecord(), false);
  assert.equal(qualifyOfficial(card(), 0, 50), false);
});

test("Yacht cannot auto-promote", () => {
  assert.equal(yachtCanAutoPromote(), false);
  const r = promoteChallenger({
    version: MODEL_YACHT_MLB_CONTRACT,
    sport: "mlb",
    stats: { n: 900, brier: 0.1, roi: 0.4, clv: 0.08, calibrationDelta: 0.01, maxDrawdown: -1 },
    champion: { n: 900, brier: 0.24, roi: 0, clv: 0, calibrationDelta: 0.05, maxDrawdown: -12 },
    confirmLive: true,
  });
  assert.equal(r.livePosting, false);
  assert.equal(r.ok, false);
  assertYachtShadowOnly();
});
