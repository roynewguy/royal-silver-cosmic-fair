import assert from "node:assert/strict";
import { test } from "node:test";
import { closeIsNotAFeature, marketBaseline, modelVsMarket, oneSidedIsNotNoVig } from "./market.ts";
import type { YachtMarketSnapshot } from "../core/provenance.ts";

const predictionAt = "2026-06-01T17:00:00.000Z";

function mkt(over: Partial<YachtMarketSnapshot> = {}): YachtMarketSnapshot {
  return {
    sportsbook: "DraftKings",
    capturedAt: "2026-06-01T16:00:00.000Z",
    openCapturedAt: "2026-06-01T12:00:00.000Z",
    closeCapturedAt: "2026-06-01T23:00:00.000Z",
    homeOpen: -140,
    awayOpen: 120,
    homeCurrent: -150,
    awayCurrent: 130,
    homeClose: -160,
    awayClose: 140,
    source: "odds-api",
    ...over,
  };
}

test("market baseline requires a proven two-way quote before predictionAt", () => {
  const ok = marketBaseline(mkt(), predictionAt);
  assert.ok(ok);
  assert.equal(ok!.kind, "open");
  assert.ok(Math.abs(ok!.noVigHome + ok!.noVigAway - 1) < 1e-9);
  assert.equal(marketBaseline(mkt({ openCapturedAt: null, capturedAt: null }), predictionAt), null);
  assert.equal(marketBaseline(mkt({ openCapturedAt: "2026-06-01T18:00:00.000Z", capturedAt: "2026-06-01T18:00:00.000Z" }), predictionAt), null);
});

test("one-sided quotes are not no-vig and close is not a feature", () => {
  assert.equal(oneSidedIsNotNoVig(-140, null), true);
  assert.equal(closeIsNotAFeature(["home_win_pct", "open_no_vig_home"]), true);
  assert.equal(closeIsNotAFeature(["home_close"]), false);
  const base = marketBaseline(mkt(), predictionAt)!;
  assert.ok(modelVsMarket(0.62, base) !== 0);
});
