import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCalibration, probabilityBucket } from "./calibration.ts";
import type { PickRow } from "./types.ts";

function pick(over: Partial<PickRow>): PickRow {
  return {
    id: 1,
    gameId: "nfl:1",
    sport: "NFL",
    league: "nfl",
    matchup: "DEN @ SEA",
    market: "spread",
    selection: "SEA -3",
    side: "home",
    lockedLine: -3,
    lockedOdds: -110,
    lockedOddsJson: {} as PickRow["lockedOddsJson"],
    reason: "x",
    research: null,
    confidence: 62,
    edgePct: 4,
    units: 1,
    status: "graded",
    result: "WIN",
    profitUnits: 0.91,
    startAt: "",
    postAt: "",
    postedAt: "",
    gradedAt: "",
    discordMessage: null,
    discordMessageId: "1",
    officialKey: "k",
    skipReason: null,
    modelVersion: "v2-nfl",
    modelProbability: 0.62,
    modelEdge: 4,
    freezeJson: "{}",
    selectedOdds: -110,
    postedOdds: -110,
    closingOdds: -120,
    clv: 0.02,
    createdAt: "",
    homeLogo: null,
    awayLogo: null,
    homeAbbr: null,
    awayAbbr: null,
    homeScore: null,
    awayScore: null,
    gameStatus: "final",
    ...over,
  };
}

test("probability buckets land on 55-59 / 60-64 / 65-69 / 70+", () => {
  assert.equal(probabilityBucket(0.57), "55-59");
  assert.equal(probabilityBucket(0.62), "60-64");
  assert.equal(probabilityBucket(0.68), "65-69");
  assert.equal(probabilityBucket(0.73), "70+");
  assert.equal(probabilityBucket(0.5), "other");
});

test("calibration compares expected vs actual and does not rewrite tickets", () => {
  const tickets = [
    pick({ id: 1, modelProbability: 0.61, result: "WIN", profitUnits: 0.91, modelVersion: "v2-nfl" }),
    pick({ id: 2, modelProbability: 0.63, result: "LOSS", profitUnits: -1, modelVersion: "v2-nfl" }),
    pick({ id: 3, modelProbability: 0.62, result: "PUSH", profitUnits: 0, modelVersion: "v2-nfl" }),
    pick({ id: 4, modelProbability: 0.71, result: "WIN", profitUnits: 0.91, modelVersion: "v2-nba" }),
    pick({ id: 5, status: "queued", result: null, modelProbability: 0.9, modelVersion: "v2-nfl" }),
  ];
  const report = buildCalibration(tickets);
  const mid = report.buckets.find((b) => b.key === "60-64");
  assert.equal(mid?.bets, 3);
  assert.equal(mid?.wins, 1);
  assert.equal(mid?.losses, 1);
  assert.equal(mid?.pushes, 1);
  assert.equal(mid?.decided, 2);
  assert.ok(mid && mid.actualWinRate != null && Math.abs(mid.actualWinRate - 0.5) < 1e-9);
  assert.ok(mid && mid.expectedWinRate != null && mid.expectedWinRate > 0.6);
  assert.equal(mid?.enough, false);
  const nfl = report.models.find((m) => m.key === "v2-nfl");
  const nba = report.models.find((m) => m.key === "v2-nba");
  assert.equal(nfl?.bets, 3);
  assert.equal(nba?.wins, 1);
  assert.equal(report.official, 4);
  assert.match(report.note, /30/);
});
