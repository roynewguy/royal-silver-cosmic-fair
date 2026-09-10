import assert from "node:assert/strict";
import { test } from "node:test";
import { makeFeature, type YachtMarketSnapshot } from "../core/provenance.ts";
import { buildYachtSnapshot } from "../core/snapshot.ts";
import { fitIntelLogReg } from "./models/logreg.ts";
import { fitGbt } from "./models/gbt.ts";
import { mlbFeatureVector } from "./sports/mlb/vector.ts";
import { MLB_CHAMPION, mlbChallengerCannotPostOfficial, predictMlbChallenger } from "./sports/mlb/engine.ts";
import { challengerEngine, challengerMayPostOfficial } from "./challenger.ts";
import { attachEvaluation, emptyShadowStore, persistShadow, runChallengerSafe, shadowDoesNotChangePublicRecord } from "./shadow.ts";
import { requestPromotion, autoPromoteIsForbidden } from "./promotion.ts";
import { yachtCandidateVersion } from "./prediction.ts";
import { canQueueOfficial, PRODUCTION_MODELS } from "../../models-v3/registry.ts";

const predictionAt = "2026-06-01T17:00:00.000Z";
const startAt = "2026-06-01T20:00:00.000Z";

function market(over: Partial<YachtMarketSnapshot> = {}): YachtMarketSnapshot {
  return {
    sportsbook: "DraftKings",
    capturedAt: "2026-06-01T16:30:00.000Z",
    openCapturedAt: "2026-06-01T12:00:00.000Z",
    closeCapturedAt: "2026-06-01T23:00:00.000Z",
    homeOpen: -130,
    awayOpen: 110,
    homeCurrent: -140,
    awayCurrent: 120,
    homeClose: -155,
    awayClose: 135,
    source: "odds-api",
    ...over,
  };
}

function feats(extra: Parameters<typeof makeFeature>[0][] = []) {
  const base = [
    makeFeature({ key: "home_win_pct", value: 0.62, source: "priors", knownAt: "2026-05-31T00:00:00.000Z", capturedAt: "2026-05-31T00:00:00.000Z", predictionAt, quality: 1 }),
    makeFeature({ key: "away_win_pct", value: 0.48, source: "priors", knownAt: "2026-05-31T00:00:00.000Z", capturedAt: "2026-05-31T00:00:00.000Z", predictionAt, quality: 1 }),
    makeFeature({ key: "home_last5", value: 0.6, source: "priors", knownAt: "2026-05-31T00:00:00.000Z", capturedAt: "2026-05-31T00:00:00.000Z", predictionAt, quality: 1 }),
    makeFeature({ key: "away_last5", value: 0.4, source: "priors", knownAt: "2026-05-31T00:00:00.000Z", capturedAt: "2026-05-31T00:00:00.000Z", predictionAt, quality: 1 }),
    makeFeature({ key: "home_era", value: 3.1, source: "espn-probable", knownAt: "2026-06-01T16:00:00.000Z", capturedAt: "2026-06-01T16:00:00.000Z", predictionAt, quality: 0.55 }),
    makeFeature({ key: "away_era", value: 4.4, source: "espn-probable", knownAt: "2026-06-01T16:00:00.000Z", capturedAt: "2026-06-01T16:00:00.000Z", predictionAt, quality: 0.55 }),
    makeFeature({ key: "open_no_vig_home", value: 0.545, source: "DraftKings", knownAt: "2026-06-01T12:00:00.000Z", capturedAt: "2026-06-01T12:00:00.000Z", predictionAt, quality: 1 }),
    makeFeature({ key: "fip", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
  ];
  return [...base, ...extra.map((e) => makeFeature(e))];
}

function snap(over: { features?: ReturnType<typeof feats>; market?: YachtMarketSnapshot } = {}) {
  return buildYachtSnapshot({
    gameId: "mlb:lad-sf",
    sport: "mlb",
    league: "mlb",
    modelVersion: yachtCandidateVersion("mlb", "logreg"),
    predictionAt,
    startAt,
    features: over.features ?? feats(),
    market: over.market ?? market(),
  });
}

test("production champion remains v2-mlb", () => {
  assert.equal(MLB_CHAMPION, "v2-mlb");
  assert.equal(PRODUCTION_MODELS.mlb, "v2-mlb");
  assert.equal(canQueueOfficial("v2-mlb"), true);
  assert.equal(canQueueOfficial(yachtCandidateVersion("mlb", "logreg")), false);
  assert.equal(mlbChallengerCannotPostOfficial(), true);
  assert.equal(challengerMayPostOfficial(yachtCandidateVersion("mlb", "gbt")), false);
});

test("MLB vector drops unproven features and rejects close/result leakage", () => {
  const v = mlbFeatureVector(feats(), market(), predictionAt);
  assert.ok(v.names.includes("era_diff"));
  assert.equal(v.names.some((n) => /close|home_win$/.test(n)), false);
  assert.throws(() =>
    mlbFeatureVector(
      feats([
        { key: "home_score", value: 5, source: "final", knownAt: "2026-06-01T16:00:00.000Z", capturedAt: "2026-06-01T16:00:00.000Z", predictionAt, quality: 1 },
      ]),
      market(),
      predictionAt,
    ),
  );
});

test("missing starter ERA lowers quality and PASSes rather than forcing a bet", () => {
  const features = feats().map((f) =>
    f.key === "home_era" || f.key === "away_era"
      ? makeFeature({ ...f, value: null, knownAt: null, capturedAt: null, missing: true, quality: 0 })
      : f,
  );
  const s = snap({ features });
  const x = Array.from({ length: 40 }, (_, i) => [1, i < 20 ? 0.2 : 0.8, 0.4]);
  const y = x.map((_, i) => (i < 20 ? 0 : 1));
  const pred = predictMlbChallenger({
    snapshot: s,
    kind: "logreg",
    artifacts: { logreg: fitIntelLogReg(x, y, { steps: 200 }) },
  });
  assert.equal(pred.official, false);
  assert.equal(pred.researchStance, "PASS");
  assert.ok(pred.passReasons.includes("starter_unproven"));
  assert.ok(pred.dataQuality < 0.9);
  assert.ok(pred.uncertainty > 0.2);
});

test("market candidate uses proven no-vig; unproven open drops the row", () => {
  const unproven = snap({ market: market({ openCapturedAt: null, capturedAt: null }) });
  const pred = predictMlbChallenger({ snapshot: unproven, kind: "market" });
  assert.equal(pred.researchStance, "PASS");
  assert.equal(pred.marketProbability, null);
  assert.ok(pred.passReasons.includes("unproven_market"));
});

test("all three MLB candidates emit official=false shadow predictions", () => {
  const s = snap();
  const x = Array.from({ length: 40 }, (_, i) => [1, i < 20 ? 0.2 : 0.8, 0.4]);
  const y = x.map((_, i) => (i < 20 ? 0 : 1));
  const artifacts = { logreg: fitIntelLogReg(x, y, { steps: 200 }), gbt: fitGbt(x, y, { nTrees: 6, depth: 1, minLeaf: 4 }) };
  for (const kind of ["logreg", "gbt", "market"] as const) {
    const pred = predictMlbChallenger({ snapshot: s, kind, artifacts });
    assert.equal(pred.official, false);
    assert.equal(pred.sport, "mlb");
    assert.equal(pred.lifecycle, "SHADOW");
    assert.equal(pred.candidateKind, kind);
    assert.equal(canQueueOfficial(pred.modelVersion), false);
  }
});

test("NFL engine is SHADOW (detailed in nfl-engine tests); NCAAF stays DATA_COLLECTION", () => {
  const nfl = challengerEngine("nfl");
  assert.equal(nfl?.lifecycle, "SHADOW");
  assert.equal(nfl?.championVersion, "v2-nfl");
  const ncaaf = challengerEngine("ncaaf");
  assert.equal(ncaaf?.lifecycle, "DATA_COLLECTION");
});

test("shadow store is official=false; close/result attach later; failures isolate from V2", () => {
  const s = snap();
  const pred = predictMlbChallenger({ snapshot: s, kind: "market" });
  const store = emptyShadowStore();
  persistShadow(store, pred);
  assert.equal(store.records.length, 1);
  assert.equal(shadowDoesNotChangePublicRecord(pred), true);
  const graded = attachEvaluation(pred, {
    result: 1,
    closeHome: -155,
    closeAway: 135,
    stakeHome: -130,
    stakeAway: 110,
    betHome: true,
  });
  assert.equal(graded.probability, pred.probability);
  assert.equal(graded.result, 1);
  assert.ok(graded.clv != null);
  const isolated = runChallengerSafe(() => {
    throw new Error("yacht boom");
  });
  assert.equal(isolated.ok, false);
  if (!isolated.ok) assert.match(isolated.error, /yacht boom/);
});

test("promotion is sport-specific, never auto, never changes V2", () => {
  assert.equal(autoPromoteIsForbidden(), true);
  const denied = requestPromotion({
    sport: "mlb",
    current: "SHADOW",
    evidence: {
      nForward: 10,
      brier: 0.3,
      championBrier: 0.2,
      logLoss: 0.7,
      calibrationError: 0.2,
      clv: null,
      missingDataRate: 0.8,
      operationalFailures: 1,
      roi: 1,
    },
    ceoApproved: true,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.livePosting, false);
  assert.equal(denied.championRemains, "v2-mlb");
});

test("future timestamps are unusable in the MLB vector", () => {
  const future = makeFeature({
    key: "home_era",
    value: 1.8,
    source: "future",
    knownAt: "2026-06-01T19:00:00.000Z",
    capturedAt: "2026-06-01T19:00:00.000Z",
    predictionAt,
    quality: 1,
  });
  assert.equal(future.usable, false);
  const v = mlbFeatureVector(
    feats().map((f) => (f.key === "home_era" ? future : f)),
    market(),
    predictionAt,
  );
  assert.ok(v.missingCritical.includes("starting_pitcher_era"));
});
