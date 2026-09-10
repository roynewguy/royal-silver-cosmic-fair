import assert from "node:assert/strict";
import { test } from "node:test";
import { makeFeature, type YachtMarketSnapshot } from "../../../core/provenance.ts";
import { buildYachtSnapshot } from "../../../core/snapshot.ts";
import { fitIntelLogReg } from "../../models/logreg.ts";
import { fitGbt, gbtFeatureImportance } from "../../models/gbt.ts";
import { nflFeatureVector, NFL_FEATURE_SCHEMA_VERSION, NFL_VECTOR_KEYS } from "./vector.ts";
import { NFL_CHAMPION, nflChallengerCannotPostOfficial, nflYachtVersion, predictNflChallenger, type NflChallengerArtifacts } from "./engine.ts";
import { challengerEngine, challengerMayPostOfficial } from "../../challenger.ts";
import { emptyShadowStore, persistShadow, runChallengerSafe, shadowDoesNotChangePublicRecord } from "../../shadow.ts";
import { requestPromotion, autoPromoteIsForbidden } from "../../promotion.ts";
import { randomTrainTestSplit } from "../../walk-forward.ts";
import { fitNflFold, nflWalkForward, predictNflFold, type NflTrainRow } from "./train.ts";
import { reportNflWalkForward } from "./report.ts";
import { runNflShadowTick } from "./shadow-tick.ts";
import { v2NflHomeProbability, v2NflStillChampionTag } from "./v2-compare.ts";
import { nflInjuryGroup, nflInjuryWeights } from "./injuries.ts";
import { missingKeys } from "../../features/spec.ts";
import { featureContract } from "../../features/index.ts";
import { rankNfl } from "../../../../sports/models/nfl.ts";
import { canQueueOfficial, PRODUCTION_MODELS } from "../../../../models-v3/registry.ts";
import {
  yachtCanQueueOfficial,
  yachtCanPostOfficialDiscord,
  yachtCanPostFreeDiscord,
  yachtCanChangePublicRecord,
  yachtCanAutoPromote,
} from "../../../safety.ts";
import type { GameCard, Injury, OddsSnapshot } from "../../../../sports/types.ts";

const predictionAt = "2026-09-06T17:00:00.000Z";
const startAt = "2026-09-06T20:00:00.000Z"; // Sunday

function market(over: Partial<YachtMarketSnapshot> = {}): YachtMarketSnapshot {
  return {
    sportsbook: "DraftKings",
    capturedAt: "2026-09-06T16:30:00.000Z",
    openCapturedAt: "2026-09-06T12:00:00.000Z",
    closeCapturedAt: "2026-09-06T19:50:00.000Z",
    homeOpen: -140,
    awayOpen: 120,
    homeCurrent: -150,
    awayCurrent: 130,
    homeClose: -165,
    awayClose: 145,
    source: "odds-api",
    ...over,
  };
}

function feats(extra: Parameters<typeof makeFeature>[0][] = []) {
  const known = "2026-09-05T00:00:00.000Z";
  const injAt = "2026-09-06T15:00:00.000Z";
  const wxAt = "2026-09-06T16:00:00.000Z";
  const base = [
    makeFeature({ key: "home_win_pct", value: 0.7, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "away_win_pct", value: 0.4, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "home_last5", value: 0.8, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "away_last5", value: 0.2, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "home_last10", value: 0.7, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "away_last10", value: 0.3, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "home_rest_days", value: 7, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "away_rest_days", value: 4, source: "priors", knownAt: known, capturedAt: known, predictionAt, quality: 1 }),
    makeFeature({ key: "injury_away_minus_home", value: 0.2, source: "espn-injury-board", knownAt: injAt, capturedAt: injAt, predictionAt, quality: 0.8 }),
    makeFeature({ key: "qb_out_home", value: 0, source: "espn-injury-board", knownAt: injAt, capturedAt: injAt, predictionAt, quality: 0.85 }),
    makeFeature({ key: "qb_out_away", value: 0, source: "espn-injury-board", knownAt: injAt, capturedAt: injAt, predictionAt, quality: 0.85 }),
    makeFeature({ key: "open_no_vig_home", value: 0.56, source: "DraftKings", knownAt: "2026-09-06T12:00:00.000Z", capturedAt: "2026-09-06T12:00:00.000Z", predictionAt, quality: 1 }),
    makeFeature({ key: "wind_mph", value: 12, source: "espn-weather", knownAt: wxAt, capturedAt: wxAt, predictionAt, quality: 0.6 }),
    makeFeature({ key: "epa_off", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
    makeFeature({ key: "cpoe", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
  ];
  return [...base, ...extra.map((e) => makeFeature(e))];
}

function snap(over: { features?: ReturnType<typeof feats>; market?: YachtMarketSnapshot; startAt?: string } = {}) {
  return buildYachtSnapshot({
    gameId: "nfl:sea-den",
    sport: "nfl",
    league: "nfl",
    modelVersion: nflYachtVersion("logreg"),
    predictionAt,
    startAt: over.startAt ?? startAt,
    features: over.features ?? feats(),
    market: over.market ?? market(),
  });
}

function toyArtifacts(): NflChallengerArtifacts {
  const x = Array.from({ length: 60 }, (_, i) => {
    const row = Array(NFL_VECTOR_KEYS.length).fill(0);
    row[0] = 1;
    row[1] = i < 30 ? 0.35 : 0.7;
    row[2] = i < 30 ? 0.65 : 0.35;
    row[30] = i < 30 ? 0.42 : 0.58;
    return row;
  });
  const y = x.map((_, i) => (i < 30 ? 0 : 1));
  return {
    schemaVersion: NFL_FEATURE_SCHEMA_VERSION,
    featureNames: [...NFL_VECTOR_KEYS],
    logreg: fitIntelLogReg(x, y, { steps: 250 }),
    gbt: fitGbt(x, y, { nTrees: 8, depth: 1, minLeaf: 4 }),
  };
}

const dk: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -130,
  awayMl: 110,
  homeSpread: -3,
  awaySpread: 3,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 44.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: -3,
  openTotal: 45,
  openHomeMl: -125,
  source: "odds-api",
  capturedAt: new Date(Date.now() + 60_000).toISOString(),
};

function v2Game(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "nfl:1",
    espnId: "1",
    sport: "NFL",
    league: "nfl",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    status: "scheduled",
    home: {
      name: "Seahawks",
      abbr: "SEA",
      logo: null,
      score: null,
      record: "10-6",
      homeSplit: "7-1",
      roadSplit: "3-5",
      starter: null,
    },
    away: {
      name: "Broncos",
      abbr: "DEN",
      logo: null,
      score: null,
      record: "8-8",
      homeSplit: "5-3",
      roadSplit: "3-5",
      starter: null,
    },
    venue: null,
    odds: dk,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    fetchedAt: new Date().toISOString(),
    injuriesFetchedAt: new Date().toISOString(),
    weatherFetchedAt: new Date().toISOString(),
    ...over,
  };
}

test("production champion remains v2-nfl", () => {
  assert.equal(NFL_CHAMPION, "v2-nfl");
  assert.equal(PRODUCTION_MODELS.nfl, "v2-nfl");
  assert.equal(canQueueOfficial("v2-nfl"), true);
  assert.equal(canQueueOfficial(nflYachtVersion("logreg")), false);
  assert.equal(nflChallengerCannotPostOfficial(), true);
  assert.equal(challengerMayPostOfficial(nflYachtVersion("gbt")), false);
  assert.equal(yachtCanQueueOfficial(nflYachtVersion("logreg")), false);
  assert.equal(yachtCanPostOfficialDiscord(nflYachtVersion("logreg")), false);
  assert.equal(yachtCanPostFreeDiscord(nflYachtVersion("logreg")), false);
  assert.equal(yachtCanChangePublicRecord(nflYachtVersion("logreg")), false);
  assert.equal(yachtCanAutoPromote(nflYachtVersion("logreg")), false);
});

test("V2 NFL behavior is unchanged", () => {
  const g = v2Game();
  const ranked = rankNfl(g);
  assert.equal(ranked?.model, "v2-nfl");
  assert.equal(v2NflStillChampionTag(g), "v2-nfl");
  const p = v2NflHomeProbability(g);
  assert.ok(p != null && p > 0.5);
  const src = rankNfl.toString();
  assert.match(src, /0\.34/);
  assert.match(src, /0\.028/);
});

test("NFL vector drops unproven features and rejects close/result leakage", () => {
  const v = nflFeatureVector(feats(), market(), predictionAt, startAt);
  assert.equal(v.schemaVersion, NFL_FEATURE_SCHEMA_VERSION);
  assert.ok(v.names.includes("qb_out_home"));
  assert.equal(v.names.includes("epa_off"), false);
  assert.equal(v.values[v.names.indexOf("epa_missing")], 1);
  assert.equal(v.names.some((n) => /close|home_win$/.test(n)), false);
  assert.throws(() =>
    nflFeatureVector(
      feats([{ key: "home_score", value: 27, source: "final", knownAt: "2026-09-06T16:00:00.000Z", capturedAt: "2026-09-06T16:00:00.000Z", predictionAt, quality: 1 }]),
      market(),
      predictionAt,
      startAt,
    ),
  );
  assert.throws(() =>
    nflFeatureVector(
      feats([{ key: "closing_line", value: -165, source: "close", knownAt: "2026-09-06T16:00:00.000Z", capturedAt: "2026-09-06T16:00:00.000Z", predictionAt, quality: 1 }]),
      market(),
      predictionAt,
      startAt,
    ),
  );
});

test("QB info after prediction time cannot leak; missing EPA stays missing", () => {
  const futureQb = makeFeature({
    key: "qb_out_home",
    value: 1,
    source: "late-news",
    knownAt: "2026-09-06T19:00:00.000Z",
    capturedAt: "2026-09-06T19:00:00.000Z",
    predictionAt,
    quality: 1,
  });
  assert.equal(futureQb.usable, false);
  const v = nflFeatureVector(
    feats().map((f) => (f.key === "qb_out_home" ? futureQb : f)),
    market(),
    predictionAt,
    startAt,
  );
  assert.equal(v.values[v.names.indexOf("qb_out_home")], 0);
  const epa = feats().find((f) => f.key === "epa_off");
  assert.equal(epa?.missing, true);
  assert.equal(epa?.usable, false);
  assert.equal(epa?.value, null);
});

test("missing features remain missing and raise uncertainty", () => {
  const stripped = feats().map((f) =>
    f.key === "home_win_pct" || f.key === "away_win_pct" || f.key.startsWith("qb_")
      ? makeFeature({ ...f, value: null, knownAt: null, capturedAt: null, missing: true, quality: 0 })
      : f,
  );
  const pred = predictNflChallenger({ snapshot: snap({ features: stripped }), kind: "logreg", artifacts: toyArtifacts() });
  assert.equal(pred.official, false);
  assert.equal(pred.researchStance, "PASS");
  assert.ok(pred.uncertainty > 0.3);
  assert.ok(pred.dataQuality < 0.8);
});

test("market candidate uses proven no-vig; unproven open drops the row", () => {
  const unproven = snap({ market: market({ openCapturedAt: null, capturedAt: null }) });
  const pred = predictNflChallenger({ snapshot: unproven, kind: "market" });
  assert.equal(pred.researchStance, "PASS");
  assert.equal(pred.marketProbability, null);
  assert.ok(pred.passReasons.includes("unproven_market"));
});

test("all three NFL candidates emit official=false shadow predictions in valid range", () => {
  const s = snap();
  const artifacts = toyArtifacts();
  for (const kind of ["logreg", "gbt", "market"] as const) {
    const pred = predictNflChallenger({ snapshot: s, kind, artifacts });
    assert.equal(pred.official, false);
    assert.equal(pred.sport, "nfl");
    assert.equal(pred.lifecycle, "SHADOW");
    assert.equal(pred.candidateKind, kind);
    assert.ok(pred.probability >= 0 && pred.probability <= 1);
    assert.equal(canQueueOfficial(pred.modelVersion), false);
    assert.match(pred.modelVersion, /model-yacht-nfl-.+-2026\.09\.2/);
  }
});

test("artifact/schema mismatch fails closed", () => {
  const s = snap();
  assert.throws(() => predictNflChallenger({ snapshot: s, kind: "logreg" }), /artifact missing/);
  const bad: NflChallengerArtifacts = { ...toyArtifacts(), schemaVersion: "nope" as typeof NFL_FEATURE_SCHEMA_VERSION };
  assert.throws(() => predictNflChallenger({ snapshot: s, kind: "gbt", artifacts: bad }), /schema mismatch/);
  const short: NflChallengerArtifacts = { ...toyArtifacts(), featureNames: ["bias"] };
  assert.throws(() => predictNflChallenger({ snapshot: s, kind: "logreg", artifacts: short }), /schema mismatch/);
});

test("NFL engine is SHADOW; NCAAF remains DATA_COLLECTION", () => {
  const nfl = challengerEngine("nfl");
  const ncaaf = challengerEngine("ncaaf");
  assert.equal(nfl?.lifecycle, "SHADOW");
  assert.equal(nfl?.championVersion, "v2-nfl");
  assert.equal(nfl?.official, false);
  const pred = nfl?.predict({ snapshot: snap(), kind: "market" });
  assert.equal(pred?.official, false);
  assert.equal(ncaaf?.lifecycle, "DATA_COLLECTION");
  assert.throws(() => ncaaf?.predict({ snapshot: snap(), kind: "logreg" }));
});

test("positional injury weights: QB >> WR, unknown stays other", () => {
  assert.equal(nflInjuryGroup("QB"), "qb");
  assert.equal(nflInjuryGroup("LT"), "ol");
  assert.equal(nflInjuryGroup(null), "other");
  const inj: Injury[] = [
    { team: "away", player: "X", status: "out", position: "QB" },
    { team: "home", player: "Y", status: "out", position: "WR" },
  ];
  const w = nflInjuryWeights(inj);
  assert.ok(w.qbOutAway === 1);
  assert.ok(w.deltaAwayMinusHome > 0);
  assert.ok(w.byGroupAway.qb > w.byGroupHome.wr);
});

test("shadow store + isolation: Yacht failure does not change V2", () => {
  const pred = predictNflChallenger({ snapshot: snap(), kind: "market" });
  const store = emptyShadowStore();
  persistShadow(store, pred);
  assert.equal(shadowDoesNotChangePublicRecord(pred), true);
  const isolated = runChallengerSafe(() => {
    throw new Error("yacht boom");
  });
  assert.equal(isolated.ok, false);
  const g = v2Game();
  assert.equal(rankNfl(g)?.model, "v2-nfl");
});

test("challenger cannot queue official or post Discord", () => {
  const pred = predictNflChallenger({ snapshot: snap(), kind: "market" });
  assert.equal(pred.official, false);
  assert.equal(canQueueOfficial(pred.modelVersion), false);
  assert.equal(challengerMayPostOfficial(pred.modelVersion), false);
});

test("promotion is never auto and never changes V2 NFL", () => {
  assert.equal(autoPromoteIsForbidden(), true);
  const denied = requestPromotion({
    sport: "nfl",
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
  assert.equal(denied.championRemains, "v2-nfl");
});

test("EPA/CPOE remain unusable on the NFL contract", () => {
  const miss = missingKeys(featureContract("nfl"));
  assert.ok(miss.includes("epa_off"));
  assert.ok(miss.includes("cpoe"));
  assert.equal(featureContract("nfl").features.find((f) => f.key === "epa_off")?.usableAsFeature, false);
  assert.equal(featureContract("nfl").features.find((f) => f.key === "closing_line")?.usableAsFeature, false);
});

test("walk-forward split is chronological; random split is forbidden", () => {
  assert.throws(() => randomTrainTestSplit());
  const rows: NflTrainRow[] = [];
  for (let i = 0; i < 40; i += 1) {
    const start = new Date(Date.UTC(2024, 8, 8 + i * 7, 17)).toISOString();
    const predAt = new Date(Date.UTC(2024, 8, 8 + i * 7, 14)).toISOString();
    rows.push({
      startAt: start,
      predictionAt: predAt,
      features: feats(),
      market: market(),
      y: i % 3 === 0 ? 0 : 1,
      homeOpen: -130,
      awayOpen: 110,
      closeHome: -140,
      closeAway: 120,
    });
  }
  const [fold] = nflWalkForward(rows, [{ trainTo: "2024-11-01T00:00:00.000Z", validTo: "2025-01-01T00:00:00.000Z" }]);
  assert.ok(fold.train.length);
  assert.ok(fold.valid.length);
  assert.ok(Date.parse(fold.train.at(-1)!.startAt) < Date.parse(fold.valid[0].startAt));
  if (fold.test.length) {
    assert.ok(Date.parse(fold.valid.at(-1)!.startAt) < Date.parse(fold.test[0].startAt));
  }
});

test("calibration uses out-of-fold valid predictions; GBT importance is group-level", () => {
  const rows: NflTrainRow[] = [];
  for (let i = 0; i < 90; i += 1) {
    const start = new Date(Date.UTC(2024, 8, 8 + i, 17)).toISOString();
    const predAt = new Date(Date.UTC(2024, 8, 8 + i, 14)).toISOString();
    const strong = i >= 45;
    const f = feats([
      { key: "home_win_pct", value: strong ? 0.75 : 0.3, source: "priors", knownAt: "2024-08-01T00:00:00.000Z", capturedAt: "2024-08-01T00:00:00.000Z", predictionAt: predAt, quality: 1 },
      { key: "away_win_pct", value: strong ? 0.3 : 0.7, source: "priors", knownAt: "2024-08-01T00:00:00.000Z", capturedAt: "2024-08-01T00:00:00.000Z", predictionAt: predAt, quality: 1 },
    ]);
    rows.push({
      startAt: start,
      predictionAt: predAt,
      features: f,
      market: market({
        openCapturedAt: predAt,
        capturedAt: predAt,
        homeOpen: strong ? -150 : 130,
        awayOpen: strong ? 130 : -150,
        homeClose: strong ? -160 : 140,
        awayClose: strong ? 140 : -160,
      }),
      y: strong ? 1 : 0,
      homeOpen: strong ? -150 : 130,
      awayOpen: strong ? 130 : -150,
      closeHome: strong ? -160 : 140,
      closeAway: strong ? 140 : -160,
    });
  }
  const [fold] = nflWalkForward(rows, [{ trainTo: rows[50].startAt, validTo: rows[70].startAt }]);
  const fit = fitNflFold(fold.train, fold.valid);
  assert.equal(fit.calibrator.method === "none" || fit.calibrator.method === "platt", true);
  const testPairs = predictNflFold(fold.test, fit, "logreg");
  assert.ok(testPairs.every((p) => p.p >= 0 && p.p <= 1));
  const report = reportNflWalkForward(fold.test, fit);
  assert.ok(report.logreg.sampleSize === fold.test.length);
  assert.ok(report.market.calibration.n === fold.test.length);
  const imp = gbtFeatureImportance(fit.gbt, [...NFL_VECTOR_KEYS]);
  assert.ok(imp.length === NFL_VECTOR_KEYS.length);
  assert.equal(imp.some((x) => x.name === "closing_line"), false);
});

test("shadow tick skips non-NFL and does not post official; missing artifact skips logreg", () => {
  const store = emptyShadowStore();
  const nba = v2Game({ league: "nba", sport: "NBA", id: "nba:1" });
  const nfl = v2Game({ startAt: "2026-12-01T21:00:00.000Z" });
  const res = runNflShadowTick({
    games: [nba, nfl],
    store,
    now: "2026-11-01T18:00:00.000Z",
    kinds: ["market", "logreg"],
  });
  assert.equal(res.error, null);
  assert.ok(res.predicted >= 1);
  assert.ok(res.skipped >= 1);
  assert.ok(store.records.every((r) => r.official === false && r.sport === "nfl"));
});
