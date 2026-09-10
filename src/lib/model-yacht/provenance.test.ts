import assert from "node:assert/strict";
import { test } from "node:test";
import { assertNoFutureFeature, featureUsable, knownAtOrBefore, makeFeature, provenPregameTwoWay, snapshotProvenanceOk, twoWayPregame, type YachtMarketSnapshot } from "./provenance.ts";
import { snapshotIdFrom } from "./core/snapshot.ts";
import { yachtVersion } from "./core/versioning.ts";

test("feature.known_at must be at or before prediction_at to be usable", () => {
  const predictionAt = "2026-06-01T17:00:00Z";
  const ok = makeFeature({
    key: "home_last5",
    value: 0.6,
    source: "priors",
    knownAt: "2026-05-31T20:00:00Z",
    capturedAt: predictionAt,
    predictionAt,
    quality: 1,
  });
  assert.equal(ok.usable, true);
  assertNoFutureFeature(ok);

  const late = makeFeature({
    key: "lineup",
    value: "posted",
    source: "fantasy",
    knownAt: "2026-06-01T19:00:00Z",
    capturedAt: "2026-06-01T19:00:00Z",
    predictionAt,
    quality: 1,
  });
  assert.equal(late.usable, false);
  assert.equal(knownAtOrBefore(late.knownAt, predictionAt), false);
  assert.equal(featureUsable({ value: 1, knownAt: null, predictionAt }), false);
});

test("two-way pregame prefers openers and does not use close", () => {
  const pair = twoWayPregame({
    homeOpen: -120,
    awayOpen: 100,
    homeCurrent: -125,
    awayCurrent: 105,
  });
  assert.deepEqual(pair, { home: -120, away: 100, kind: "open" });
  assert.equal(twoWayPregame({ homeOpen: null, awayOpen: null, homeCurrent: -110, awayCurrent: null }), null);
});

function mkt(over: Partial<YachtMarketSnapshot> = {}): YachtMarketSnapshot {
  return {
    sportsbook: "DK",
    capturedAt: "2026-06-01T16:00:00Z",
    openCapturedAt: "2026-06-01T12:00:00Z",
    closeCapturedAt: "2026-06-01T19:55:00Z",
    homeOpen: -120,
    awayOpen: 100,
    homeCurrent: -125,
    awayCurrent: 105,
    homeClose: -140,
    awayClose: 120,
    source: "odds-api",
    ...over,
  };
}

test("provenPregameTwoWay requires a real quote timestamp <= predictionAt", () => {
  const at = "2026-06-01T17:00:00Z";
  assert.equal(provenPregameTwoWay(mkt({ openCapturedAt: null, capturedAt: null }), at), null);
  assert.equal(provenPregameTwoWay(mkt({ openCapturedAt: "2026-06-01T18:00:00Z", capturedAt: null }), at), null);
  const ok = provenPregameTwoWay(mkt(), at);
  assert.equal(ok?.kind, "open");
  assert.equal(ok?.home, -120);
});

test("snapshotProvenanceOk is not two-way-plus-before-start alone", () => {
  const predictionAt = "2026-06-01T17:00:00Z";
  const startAt = "2026-06-01T20:00:00Z";
  const features = [
    makeFeature({ key: "home_last5", value: 0.6, source: "priors", knownAt: "2026-05-31T20:00:00Z", capturedAt: "2026-05-31T20:00:00Z", predictionAt, quality: 1 }),
  ];
  assert.equal(snapshotProvenanceOk({ predictionAt, startAt, market: mkt({ openCapturedAt: null, capturedAt: null }), features }), false);
  assert.equal(snapshotProvenanceOk({ predictionAt, startAt, market: mkt(), features }), true);
});

test("snapshot hashes are sport-neutral — MLB contract is not baked into core", () => {
  const mlb = snapshotIdFrom(yachtVersion("mlb"), ["g1", "t"]);
  const nfl = snapshotIdFrom(yachtVersion("nfl"), ["g1", "t"]);
  assert.notEqual(mlb, nfl);
  assert.equal(snapshotIdFrom("model-yacht-mlb-2026.09.1", ["g1", "t"]), mlb);
});

