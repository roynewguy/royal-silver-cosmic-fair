import assert from "node:assert/strict";
import { test } from "node:test";
import { expandingWalkForward, randomTrainTestSplit } from "./walk-forward.ts";
import { trainingManifest, FEATURE_SCHEMA_VERSION } from "./manifest.ts";

test("walk-forward is chronological and forbids random splits", () => {
  const rows = [
    { startAt: "2024-04-01T00:00:00Z", id: 1 },
    { startAt: "2024-06-01T00:00:00Z", id: 2 },
    { startAt: "2024-08-01T00:00:00Z", id: 3 },
    { startAt: "2024-10-01T00:00:00Z", id: 4 },
  ];
  const folds = expandingWalkForward(rows, [{ trainTo: "2024-06-15T00:00:00Z", validTo: "2024-08-15T00:00:00Z" }]);
  assert.equal(folds[0].train.length, 2);
  assert.equal(folds[0].valid.length, 1);
  assert.equal(folds[0].test.length, 1);
  assert.ok(Date.parse(folds[0].valid[0].startAt) > Date.parse(folds[0].train.at(-1)!.startAt));
  assert.throws(() => randomTrainTestSplit());
  assert.throws(() => expandingWalkForward(rows, [{ trainTo: "2024-08-01T00:00:00Z", validTo: "2024-06-01T00:00:00Z" }]));
});

test("training manifest records ranges, checksum, and rejects overlap", () => {
  const m = trainingManifest({
    sport: "mlb",
    modelVersion: "model-yacht-mlb-logreg-2026.09.1",
    candidateKind: "logreg",
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    trainFrom: "2024-04-01T00:00:00Z",
    trainTo: "2024-06-01T00:00:00Z",
    validFrom: "2024-06-02T00:00:00Z",
    validTo: "2024-07-01T00:00:00Z",
    testFrom: "2024-07-02T00:00:00Z",
    testTo: "2024-08-01T00:00:00Z",
    nGames: 10,
    nTrain: 6,
    nValid: 2,
    nTest: 2,
    featureList: ["home_win_pct"],
    hyperparameters: { l2: 0.02 },
    calibrationMethod: "platt",
    trainedAt: "2026-09-10T00:00:00Z",
    commitSha: "abc",
    artifact: { weights: [0, 1] },
  });
  assert.equal(m.artifactChecksum.length, 64);
  assert.throws(() =>
    trainingManifest({
      ...m,
      validFrom: "2024-05-01T00:00:00Z",
      artifact: { weights: [0, 1] },
    }),
  );
});
