import assert from "node:assert/strict";
import { test } from "node:test";
import { yachtPrediction } from "./output.ts";
import { yachtVersion } from "./versioning.ts";

const ok = {
  sport: "mlb",
  modelVersion: yachtVersion("mlb"),
  probability: 0.56,
  uncertainty: 0.2,
  dataQuality: 0.4,
  predictionAt: "2026-06-01T17:00:00Z",
  featureSnapshotId: "yacht_x",
};

test("yachtPrediction is never official and rejects impossible values", () => {
  const pred = yachtPrediction(ok);
  assert.equal(pred.official, false);
  assert.throws(() => yachtPrediction({ ...ok, probability: 1.2 }), /between 0 and 1/);
  assert.throws(() => yachtPrediction({ ...ok, probability: -0.1 }), /between 0 and 1/);
  assert.throws(() => yachtPrediction({ ...ok, uncertainty: -0.01 }), /between 0 and 1/);
  assert.throws(() => yachtPrediction({ ...ok, dataQuality: 1.2 }), /between 0 and 1/);
  assert.throws(() => yachtPrediction({ ...ok, official: true }), /cannot be official/);
  assert.throws(() => yachtPrediction({ ...ok, sport: "mls" }), /unknown sport/);
  assert.throws(() => yachtPrediction({ ...ok, modelVersion: yachtVersion("nfl") }), /mismatch/);
});
