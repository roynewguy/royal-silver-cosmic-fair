import assert from "node:assert/strict";
import { test } from "node:test";
import { featureVector } from "../models-v3/features.ts";
import { sideEvalFromMarket } from "../models-v3/evaluate.ts";
import { yachtRoi, pregameStakePrice } from "./evaluate.ts";
import type { YachtMarketSnapshot } from "./provenance.ts";
import type { TrainingRow } from "../models-v3/types.ts";

function mkt(over: Partial<YachtMarketSnapshot> = {}): YachtMarketSnapshot {
  return {
    sportsbook: "DraftKings",
    capturedAt: "2026-06-01T16:00:00Z",
    homeOpen: -150,
    awayOpen: 130,
    homeCurrent: -155,
    awayCurrent: 135,
    homeClose: -170,
    awayClose: 145,
    source: "odds-api",
    ...over,
  };
}

test("Yacht ROI home bet stakes home open not close", () => {
  const r = yachtRoi([{ p: 0.7, y: 1, market: mkt() }], 0.01);
  assert.equal(r.n, 1);
  assert.ok(Math.abs(r.units - 100 / 150) < 1e-9);
});

test("Yacht ROI away bet stakes away open not home price", () => {
  const r = yachtRoi([{ p: 0.35, y: 0, market: mkt() }], 0.01);
  assert.equal(r.n, 1);
  assert.ok(Math.abs(r.units - 1.3) < 1e-9);
});

test("Yacht ROI drops missing away pregame price", () => {
  const r = yachtRoi([{ p: 0.4, y: 0, market: mkt({ awayOpen: null, awayCurrent: null, awayClose: 200 }) }], 0);
  assert.equal(r.n, 0);
  assert.equal(r.dropped, 1);
});

test("Yacht ROI never stakes the closer", () => {
  const r = yachtRoi([{ p: 0.8, y: 1, market: mkt({ homeOpen: null, awayOpen: null, homeCurrent: null, awayCurrent: null }) }], 0);
  assert.equal(r.n, 0);
  assert.equal(pregameStakePrice(null, -400), null);
});

test("closing odds do not leak into V3 feature vectors", () => {
  const row: TrainingRow = {
    gameId: "mlb:x",
    league: "mlb",
    season: 2026,
    startAt: "2026-06-01T20:00:00Z",
    homeAbbr: "LAD",
    awayAbbr: "SF",
    homeWin: true,
    features: {
      capturedAt: "2026-06-01T17:00:00Z",
      knownBeforeStart: true,
      home: { games: 20, winPct: 0.6, last5: 0.6, last10: 0.5, homeWinPct: 0.7, awayWinPct: 0.5, runsForPg: 5, runsAgainstPg: 4, runDiffPg: 1, restDays: 1 },
      away: { games: 20, winPct: 0.5, last5: 0.4, last10: 0.5, homeWinPct: 0.55, awayWinPct: 0.45, runsForPg: 4, runsAgainstPg: 4, runDiffPg: 0, restDays: 1 },
      homeStarter: { name: "A", era: 3.1, wins: null, losses: null },
      awayStarter: { name: "B", era: 4.2, wins: null, losses: null },
      venue: "Dodger Stadium",
    },
    market: { sportsbook: "DK", homeOpen: -150, awayOpen: 130, homeClose: -400, awayClose: 320, impliedHomeClose: 0.8 },
  };
  const x = featureVector(row);
  assert.equal(x.includes(-400), false);
  assert.equal(JSON.stringify(row.features).includes("-400"), false);
  const ev = sideEvalFromMarket(0.6, 1, row.market);
  assert.equal(ev.homePrice, -150);
  assert.equal(ev.closeHome, -400);
});
