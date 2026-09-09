import assert from "node:assert/strict";
import { test } from "node:test";
import {
  americanProfit,
  evaluateBetOpportunity,
  expectedValuePct,
  modelEdgePct,
  uncertaintyFromQuality,
  OFFICIAL_MIN_QUALITY,
} from "./value.ts";

test("missing no-vig market is PASS_MARKET_INCOMPLETE, not a raw-implied fallback", () => {
  const d = evaluateBetOpportunity({
    modelProbability: 0.58,
    marketProbability: null,
    price: -110,
    dataQuality: 91,
    modelUncertainty: 0.12,
    marketAgeMs: 60_000,
    sport: "mlb",
    marketType: "moneyline",
    minEdgePct: 3,
    minConfidence: 58,
    confidence: 70,
  });
  assert.equal(d.action, "PASS");
  assert.equal(d.reason, "PASS_MARKET_INCOMPLETE");
});
test("American EV at -110 is profit 0.909 when winning", () => {
  assert.ok(Math.abs(americanProfit(-110) - 100 / 110) < 1e-9);
  const ev = expectedValuePct(0.55, -110);
  const profit = 100 / 110;
  assert.ok(Math.abs(ev - (0.55 * profit - 0.45) * 100) < 1e-9);
  assert.ok(ev > 0);
  assert.ok(expectedValuePct(0.5, -110) < 0);
});

test("edge is model minus no-vig, not ROI", () => {
  assert.ok(Math.abs(modelEdgePct(0.58, 0.53) - 5) < 1e-9);
  assert.notEqual(modelEdgePct(0.58, 0.53), expectedValuePct(0.58, -110));
});

test("quality over quantity: no edge, low quality, high uncertainty all PASS", () => {
  const base = {
    modelProbability: 0.58,
    marketProbability: 0.53,
    price: -110,
    dataQuality: 91,
    modelUncertainty: 0.12,
    marketAgeMs: 60_000,
    sport: "mlb",
    marketType: "moneyline" as const,
    minEdgePct: 3,
    minConfidence: 58,
    confidence: 70,
  };
  assert.equal(evaluateBetOpportunity(base).action, "BET");
  assert.equal(evaluateBetOpportunity({ ...base, marketProbability: 0.58 }).reason, "PASS_NO_EDGE");
  assert.equal(evaluateBetOpportunity({ ...base, marketProbability: 0.56 }).reason, "PASS_EDGE_TOO_SMALL");
  assert.equal(evaluateBetOpportunity({ ...base, dataQuality: 60 }).reason, "PASS_LOW_DATA_QUALITY");
  assert.ok(60 < OFFICIAL_MIN_QUALITY);
  assert.equal(evaluateBetOpportunity({ ...base, modelUncertainty: 0.8 }).reason, "PASS_HIGH_UNCERTAINTY");
  assert.equal(evaluateBetOpportunity({ ...base, price: -500, marketProbability: 0.72, modelProbability: 0.8, minEdgePct: 3 }).reason, "PASS_PRICE_TOO_BAD");
});

test("confidence is not the model probability", () => {
  const d = evaluateBetOpportunity({
    modelProbability: 0.57,
    marketProbability: 0.52,
    price: -110,
    dataQuality: 88,
    modelUncertainty: 0.1,
    marketAgeMs: 1000,
    sport: "mlb",
    marketType: "moneyline",
    minEdgePct: 3,
    minConfidence: 58,
    confidence: 72,
  });
  assert.equal(d.confidence, 72);
  assert.notEqual(d.confidence, Math.round(0.57 * 100));
});

test("uncertainty rises when data is thin or models disagree", () => {
  const clean = uncertaintyFromQuality({ dataQuality: 90, missingCount: 0, marketAgeMs: 1000, modelDisagreement: 0 });
  const messy = uncertaintyFromQuality({ dataQuality: 40, missingCount: 6, marketAgeMs: 40 * 60_000, modelDisagreement: 0.12 });
  assert.ok(messy > clean);
});

test("line move against a thinning EV is PASS_LINE_MOVED", () => {
  const d = evaluateBetOpportunity({
    modelProbability: 0.57,
    marketProbability: 0.53,
    price: -125,
    dataQuality: 90,
    modelUncertainty: 0.1,
    marketAgeMs: 1000,
    sport: "mlb",
    marketType: "moneyline",
    minEdgePct: 3,
    minConfidence: 58,
    confidence: 70,
    openPrice: -110,
  });
  assert.equal(d.reason, "PASS_LINE_MOVED");
  assert.equal(d.action, "PASS");
});
