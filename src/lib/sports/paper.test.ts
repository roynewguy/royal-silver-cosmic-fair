import assert from "node:assert/strict";
import { test } from "node:test";
import { activeLedger, isPaperLedger, isPaperMode, paperLockMessage } from "./paper-mode.ts";
import { redactDesk } from "../desk/redact.ts";
import { EMPTY_HEALTH } from "../desk/health.ts";
import { asOfTimestamp, shouldFlagEdgeOutlier, stabilityReport } from "./validation.ts";
import { closingAsOf, oddsAsOf, replayDay } from "./replay.ts";
import { MLB_V2_INPUTS } from "./mlb-inputs.ts";
import type { DeskState, GameCard, OddsSnapshot, PickRow } from "./types.ts";

test("paper mode is off by default and uses a separate ledger", () => {
  assert.equal(isPaperMode({}), false);
  assert.equal(activeLedger({}), "official");
  assert.equal(activeLedger({ PAPER_MODE: "true" }), "paper");
  assert.equal(isPaperLedger("paper"), true);
  assert.equal(isPaperLedger("official"), false);
  assert.match(paperLockMessage("MIA ML"), /NOT A CUSTOMER PICK/);
});

test("public record redacts paper tickets", () => {
  const pick = {
    id: 1,
    gameId: "mlb:1",
    sport: "MLB",
    league: "mlb",
    matchup: "CHC @ MIA",
    market: "moneyline",
    selection: "MIA ML",
    side: "home",
    lockedLine: null,
    lockedOdds: 135,
    lockedOddsJson: { book: "DK", details: null, homeMl: 135, awayMl: -155, homeSpread: null, awaySpread: null, homeSpreadOdds: null, awaySpreadOdds: null, total: null, overOdds: null, underOdds: null, openHomeSpread: null, openTotal: null, openHomeMl: null, source: "odds-api", capturedAt: null },
    reason: "x",
    research: null,
    confidence: 64,
    edgePct: 4,
    units: 1,
    status: "posted",
    result: null,
    profitUnits: null,
    startAt: new Date().toISOString(),
    postAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
    gradedAt: null,
    discordMessage: "paper",
    discordMessageId: null,
    officialKey: "k",
    skipReason: null,
    modelVersion: "v2-mlb",
    modelProbability: 0.5,
    modelEdge: 4,
    freezeJson: "{}",
    selectedOdds: 135,
    postedOdds: 135,
    closingOdds: null,
    clv: null,
    createdAt: new Date().toISOString(),
    ledger: "paper",
    homeLogo: null,
    awayLogo: null,
    homeAbbr: "MIA",
    awayAbbr: "CHC",
    homeScore: null,
    awayScore: null,
    gameStatus: "scheduled",
  } as PickRow;
  const state = redactDesk({ picks: [pick], games: [], record: { wins: 0, losses: 0, pushes: 0, units: 0, pending: 0 }, scans: [], log: [], lastScanAt: null, lastDeskAt: null, minEdgePct: 3, minConfidence: 58, postLeadMinutes: 150, maxDailyPicks: 3, hasWebhook: false, webhookSource: "none", operator: false, soccerDesk: "off", pinFromEnv: false, calibration: null, health: EMPTY_HEALTH, researchModels: null } as DeskState, false);
  assert.equal(state.picks.length, 0);
});

const odds = (over: Partial<OddsSnapshot> = {}): OddsSnapshot => ({
  book: "ESPN BET",
  details: null,
  homeMl: 120,
  awayMl: -140,
  homeSpread: null,
  awaySpread: null,
  homeSpreadOdds: null,
  awaySpreadOdds: null,
  total: null,
  overOdds: null,
  underOdds: null,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: 105,
  source: "espn",
  capturedAt: "2026-09-04T16:00:00.000Z",
  ...over,
});

function game(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:mia",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: "2026-09-04T23:10:00.000Z",
    status: "scheduled",
    home: { name: "Marlins", abbr: "MIA", logo: null, score: 4, record: "70-70", homeSplit: null, roadSplit: null, starter: { name: "Junk", era: 4, whip: 1.2, savePct: null, position: "SP" } },
    away: { name: "Cubs", abbr: "CHC", logo: null, score: 2, record: "80-60", homeSplit: null, roadSplit: null, starter: { name: "Shota", era: 3.2, whip: 1, savePct: null, position: "SP" } },
    venue: "x",
    odds: odds(),
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

test("replay never uses future tape or closing lines to rank", () => {
  const sim = Date.parse("2026-09-04T16:00:00.000Z");
  const g = oddsAsOf(
    game({ home: { ...game().home, score: 9 }, away: { ...game().away, score: 1 } }),
    sim,
    [
      { gameId: "mlb:mia", capturedAt: "2026-09-04T15:00:00.000Z", homeMl: 130, awayMl: -150, book: "DK" },
      { gameId: "mlb:mia", capturedAt: "2026-09-04T22:00:00.000Z", homeMl: -110, awayMl: -110, book: "DK" },
    ],
    { sportsbook: "ESPN BET", homeOpen: 140, awayOpen: -160, homeClose: -120, awayClose: 100 },
  );
  assert.equal(g.odds.homeMl, 130);
  assert.equal(g.home.score, null);
  assert.equal(closingAsOf({ sportsbook: "x", homeOpen: 140, awayOpen: -160, homeClose: -120, awayClose: 100 }, game().startAt, sim), null);
});

test("asOfTimestamp drops later rows", () => {
  const kept = asOfTimestamp(
    [
      { capturedAt: "2026-09-04T10:00:00.000Z" },
      { capturedAt: "2026-09-04T18:00:00.000Z" },
    ],
    Date.parse("2026-09-04T12:00:00.000Z"),
  );
  assert.equal(kept.length, 1);
});

test("unstable output flags large probability jumps without input change", () => {
  const a = { probability: 0.51, edgePct: 3, confidence: 60 } as const;
  const b = { probability: 0.62, edgePct: 8, confidence: 70 } as const;
  const unstable = stabilityReport(a as never, b as never, []);
  assert.equal(unstable.flag, "UNSTABLE_MODEL_OUTPUT");
  const ok = stabilityReport(a as never, b as never, ["starter change"]);
  assert.equal(ok.flag, null);
});

test("edge outlier requires a reason or gets flagged", () => {
  const g = game({ odds: odds({ homeMl: 200, awayMl: -240, openHomeMl: 195 }) });
  assert.equal(shouldFlagEdgeOutlier(g, 14), true);
  assert.equal(
    shouldFlagEdgeOutlier(game({ injuries: [{ team: "away", player: "Star", status: "out", position: "RF" }] }), 14),
    false,
  );
});

test("replay paper picks are never official", () => {
  const report = replayDay({
    date: "2026-09-04",
    games: [game({ startAt: "2026-09-04T23:10:00.000Z", home: { ...game().home, score: null }, away: { ...game().away, score: null } })],
    tape: [{ gameId: "mlb:mia", capturedAt: "2026-09-04T16:00:00.000Z", homeMl: 135, awayMl: -155, book: "DK", source: "odds-api" }],
    histOdds: { "mlb:mia": { sportsbook: "ESPN BET", homeOpen: 135, awayOpen: -155, homeClose: -110, awayClose: -110 } },
    fromHourPt: 9,
    stepMs: 60 * 60_000,
  });
  assert.ok(report.paperPicks.every((p) => p.ledger === "paper"));
  assert.ok(report.source.includes("openers"));
});

test("V2 MLB weights stay frozen", () => {
  assert.ok(MLB_V2_INPUTS.productionWeightsFrozen[0].includes("0.16"));
});
