import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateKindFromVersion, challengerPrediction, yachtCandidateVersion } from "./prediction.ts";

test("challenger prediction rejects official=true and invalid probabilities", () => {
  const base = {
    sport: "mlb",
    gameId: "mlb:1",
    league: "mlb",
    startAt: "2026-06-01T20:00:00Z",
    modelVersion: yachtCandidateVersion("mlb", "logreg"),
    candidateKind: "logreg" as const,
    predictionAt: "2026-06-01T17:00:00Z",
    featureSnapshotId: "yacht_x",
    probability: 0.55,
    uncertainty: 0.2,
    dataQuality: 0.4,
    marketProbability: 0.52,
  };
  const p = challengerPrediction(base);
  assert.equal(p.official, false);
  assert.equal(candidateKindFromVersion(p.modelVersion), "logreg");
  assert.throws(() => challengerPrediction({ ...base, official: true }), /cannot be official/);
  assert.throws(() => challengerPrediction({ ...base, probability: 1.2 }), /between 0 and 1/);
  assert.throws(() => challengerPrediction({ ...base, sport: "nfl" }), /mismatch/);
  assert.throws(() => yachtCandidateVersion("mls", "logreg"));
});
