import assert from "node:assert/strict";
import { test } from "node:test";
import { averageClv, clvFromPrices, positiveClvRate } from "./clv.ts";

test("posting -110 and closing -130 is positive CLV", () => {
  const clv = clvFromPrices(-110, -130);
  assert.ok(clv != null && clv > 0);
});

test("getting a worse close is negative CLV", () => {
  const clv = clvFromPrices(-130, -110);
  assert.ok(clv != null && clv < 0);
});

test("missing prices do not invent CLV", () => {
  assert.equal(clvFromPrices(null, -110), null);
  assert.equal(clvFromPrices(-110, null), null);
  assert.equal(clvFromPrices(0, -110), null);
});

test("CLV aggregates", () => {
  assert.ok(Math.abs((averageClv([0.02, 0.04, null]) ?? 0) - 0.03) < 1e-9);
  assert.equal(positiveClvRate([0.02, -0.01, 0.03]), 2 / 3);
});
