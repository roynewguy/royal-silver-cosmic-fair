import assert from "node:assert/strict";
import { test } from "node:test";
import { assertV4NeverOfficial, blendV4, V4_WEIGHTS, v4Predict } from "./v4.ts";
import { canQueueOfficial } from "./registry.ts";
import { canRewritePrediction } from "./prediction-lock.ts";
import { priorGames, assertNoFutureGames } from "./leakage.ts";
import { FEATURE_NAMES, featureVector } from "./features.ts";
import type { GameCard, OddsSnapshot } from "../sports/types.ts";
import type { TrainingRow } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -118,
  awayMl: -102,
  homeSpread: null,
  awaySpread: null,
  homeSpreadOdds: null,
  awaySpreadOdds: null,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: -110,
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function card(): GameCard {
  return {
    id: "mlb:v4",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: "80-50", homeSplit: "42-20", roadSplit: "38-30", starter: { name: "Yamamoto", era: 2.8, whip: 0.98, savePct: null, position: "SP" } },
    away: { name: "Giants", abbr: "SF", logo: null, score: null, record: "70-60", homeSplit: "38-28", roadSplit: "32-32", starter: { name: "Webb", era: 3.4, whip: 1.12, savePct: null, position: "SP" } },
    venue: "Dodger Stadium",
    odds,
    rank: { market: "moneyline", side: "home", selection: "LAD ML", line: null, price: -118, edgePct: 5, confidence: 68, why: "x", model: "v2-mlb", probability: 0.58, noVigImplied: 0.53, dataQuality: 90 },
    notes: [],
    injuries: [],
    weather: "70 F",
    injuriesFetchedAt: new Date().toISOString(),
  };
}

test("V4 is a shadow ensemble with hardcoded weights, never official", () => {
  assert.equal(V4_WEIGHTS.v2, 0.35);
  assert.equal(V4_WEIGHTS.v3, 0.35);
  assert.equal(V4_WEIGHTS.market, 0.3);
  const p = blendV4({ v2: 0.58, v3: 0.61, market: 0.53 });
  assert.ok(Math.abs(p - (0.35 * 0.58 + 0.35 * 0.61 + 0.3 * 0.53)) < 1e-9);
  const call = v4Predict(card(), 0.58, null);
  assert.ok(call);
  assert.equal(call.official, false);
  assert.equal(canQueueOfficial(call.model), false);
  assertV4NeverOfficial(call);
});
test("V4 blends toward the market and is never official", () => {
  const p = blendV4({ v2: 0.58, v3: 0.61, market: 0.53 });
  assert.ok(p < 0.61 && p > 0.53);
  const call = v4Predict(card(), 0.58, null);
  assert.ok(call);
  assert.equal(call.official, false);
  assert.equal(canQueueOfficial(call.model), false);
  assertV4NeverOfficial(call);
});

test("V4 does not use closing line as an input (open is optional, close is absent)", () => {
  const g = card();
  assert.equal("closing" in g.odds, false);
  const call = v4Predict(g, 0.56, null);
  assert.ok(call);
  assert.equal(call.model.startsWith("v4-"), true);
});

test("leakage helper still rejects future games as priors", () => {
  const start = "2026-06-01T00:00:00Z";
  const priors = priorGames(
    [
      { gameId: "a", espnId: "a", sport: "MLB", league: "mlb", season: 2026, startAt: "2026-05-01T00:00:00Z", homeTeam: "A", awayTeam: "B", homeAbbr: "AAA", awayAbbr: "BBB", homeScore: 3, awayScore: 1, status: "final", venue: null, homeWin: true },
      { gameId: "b", espnId: "b", sport: "MLB", league: "mlb", season: 2026, startAt: "2026-06-02T00:00:00Z", homeTeam: "A", awayTeam: "C", homeAbbr: "AAA", awayAbbr: "CCC", homeScore: 5, awayScore: 2, status: "final", venue: null, homeWin: true },
    ],
    "AAA",
    start,
  );
  assert.equal(priors.length, 1);
  assert.doesNotThrow(() => assertNoFutureGames(priors, start));
});

test("shadow models cannot be queued as official Discord picks", () => {
  assert.equal(canQueueOfficial("v2-mlb"), true);
  assert.equal(canQueueOfficial("v3-mlb-logreg"), false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
});

test("graded or posted-official predictions are frozen", () => {
  assert.equal(canRewritePrediction({ result: "WIN", official: false, stage: "pregame" }), false);
  assert.equal(canRewritePrediction({ result: null, official: true, stage: "posted" }), false);
  assert.equal(canRewritePrediction({ result: null, official: false, stage: "pregame" }), true);
});

test("V3 feature vector never includes closing prices or scores", () => {
  assert.ok((FEATURE_NAMES as readonly string[]).includes("bias"));
  assert.ok(!FEATURE_NAMES.some((n) => /close|score|final/i.test(n)));
  const row = {
    gameId: "x",
    league: "mlb",
    season: 2026,
    startAt: "2026-06-01T00:00:00Z",
    homeAbbr: "AAA",
    awayAbbr: "BBB",
    homeWin: true,
    features: {
      capturedAt: "2026-06-01T00:00:00Z",
      knownBeforeStart: true as const,
      home: { games: 20, winPct: 0.6, last5: 0.6, last10: 0.5, homeWinPct: 0.7, awayWinPct: 0.5, runsForPg: 4.5, runsAgainstPg: 3.8, runDiffPg: 0.7, restDays: 1 },
      away: { games: 20, winPct: 0.5, last5: 0.4, last10: 0.5, homeWinPct: 0.55, awayWinPct: 0.45, runsForPg: 4.1, runsAgainstPg: 4.0, runDiffPg: 0.1, restDays: 1 },
      homeStarter: { name: "A", era: 3.1, wins: null, losses: null },
      awayStarter: { name: "B", era: 4.2, wins: null, losses: null },
      venue: null,
    },
    market: { sportsbook: "dk", homeOpen: -110, awayOpen: -110, homeClose: -200, awayClose: 170, impliedHomeClose: 0.67 },
  } satisfies TrainingRow;
  const v = featureVector(row);
  assert.equal(v.length, FEATURE_NAMES.length);
  assert.ok(!v.includes(-200));
});
