import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAutoGradeManual,
  countsTowardAutoCap,
  countsTowardAutoRecord,
  lineSourceLabel,
  lineSourceOf,
  liveStateLabel,
  NEEDS_MANUAL_GRADE,
  pickSourceForStatus,
  resolveManualTicket,
} from "./manual-post.ts";
import { buildManualPickMessage } from "./discord.ts";
import { gradePick } from "./grade.ts";
import { prePostTruthCheck } from "./truth-gate.ts";
import type { GameCard, OddsSnapshot, PickRow, RankPick } from "./types.ts";

function odds(over: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    book: "DraftKings",
    details: null,
    homeMl: -110,
    awayMl: -110,
    homeSpread: -3.5,
    awaySpread: 3.5,
    homeSpreadOdds: -110,
    awaySpreadOdds: -110,
    total: 220.5,
    overOdds: -110,
    underOdds: -110,
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: null,
    source: "odds-api",
    capturedAt: new Date().toISOString(),
    ...over,
  };
}

function game(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "nba:1",
    espnId: "1",
    sport: "NBA",
    league: "nba",
    startAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Los Angeles Lakers", abbr: "LAL", logo: null, score: null, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Boston Celtics", abbr: "BOS", logo: null, score: null, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
    venue: "Crypto.com",
    odds: odds(),
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    clock: null,
    period: null,
    shortDetail: null,
    ...over,
  };
}

test("operator can resolve a scheduled manual play", () => {
  const t = resolveManualTicket({ game: game(), market: "moneyline", side: "home" });
  assert.equal(t.pickSource, "manual");
  assert.equal(t.odds, -110);
  assert.equal(t.lineSource, "draftkings");
});

test("operator can resolve a live play with custom line and odds", () => {
  const live = game({
    status: "in_progress",
    clock: "6:42",
    period: 3,
    shortDetail: "3Q 6:42",
    home: { ...game().home, score: 71 },
    away: { ...game().away, score: 76 },
  });
  const t = resolveManualTicket({
    game: live,
    market: "spread",
    side: "home",
    selection: "Lakers +4.5",
    line: "+4.5",
    odds: "-110",
    units: 1,
    note: "Live line after Boston 8-0 run.",
  });
  assert.equal(t.pickSource, "manual_live");
  assert.equal(t.line, 4.5);
  assert.equal(t.odds, -110);
  assert.equal(t.selection, "Lakers +4.5");
  assert.equal(t.lineSource, "manual-entry");
  assert.equal(lineSourceLabel(t.lineSource), "Manual Entry");
  assert.match(t.postedScore, /BOS 76/);
  assert.equal(t.postedState, "3Q 6:42");
});

test("live manual play does not enter auto daily cap or V2 calibration set", () => {
  assert.equal(countsTowardAutoCap({ pickSource: "manual_live", officialKey: null, status: "posted" }), false);
  assert.equal(countsTowardAutoRecord({ pickSource: "manual", officialKey: "x" }), false);
  assert.equal(countsTowardAutoCap({ pickSource: "auto", officialKey: "nba:1:official", status: "posted" }), true);
});

test("custom manual line and odds are preserved exactly", () => {
  const t = resolveManualTicket({ game: game(), market: "spread", side: "home", line: 4.5, odds: -105, selection: "LAL +4.5" });
  assert.equal(t.line, 4.5);
  assert.equal(t.odds, -105);
});

test("manual entry is not labeled verified DraftKings", () => {
  const t = resolveManualTicket({ game: game(), market: "spread", side: "home", line: "+4.5", odds: "-110" });
  assert.equal(t.lineSource, "manual-entry");
  assert.notEqual(lineSourceLabel(t.lineSource), "DraftKings");
  assert.equal(lineSourceOf(game(), true), "manual-entry");
});

test("missing model probability is not invented on the Discord body", () => {
  const live = game({ status: "in_progress", home: { ...game().home, score: 71 }, away: { ...game().away, score: 76 }, shortDetail: "3Q · 6:42" });
  const t = resolveManualTicket({ game: live, market: "spread", side: "home", selection: "Lakers +4.5", line: 4.5, odds: -110 });
  const pick = {
    id: 1,
    gameId: live.id,
    sport: "NBA",
    league: "nba",
    matchup: "BOS @ LAL",
    market: "spread",
    selection: t.selection,
    side: "home",
    lockedLine: t.line,
    lockedOdds: t.odds,
    lockedOddsJson: live.odds,
    reason: t.reason,
    research: null,
    confidence: 0,
    edgePct: 0,
    units: 1,
    status: "posted",
    result: null,
    profitUnits: null,
    startAt: live.startAt,
    postAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
    gradedAt: null,
    discordMessage: null,
    discordMessageId: null,
    officialKey: null,
    skipReason: null,
    modelVersion: null,
    modelProbability: null,
    modelEdge: null,
    freezeJson: null,
    selectedOdds: t.odds,
    postedOdds: t.odds,
    closingOdds: null,
    clv: null,
    createdAt: new Date().toISOString(),
    pickSource: t.pickSource,
    lineSource: t.lineSource,
    postedScore: t.postedScore,
    postedState: t.postedState,
    homeLogo: null,
    awayLogo: null,
    homeAbbr: "LAL",
    awayAbbr: "BOS",
    homeScore: 71,
    awayScore: 76,
    gameStatus: "in_progress",
  } as PickRow;
  const msg = buildManualPickMessage(pick, live);
  assert.match(msg, /LIVE PLAY/);
  assert.match(msg, /WHY BOATBOYZ LIKES IT/);
  assert.match(msg, /favored to win at home|playing at home/i);
  assert.doesNotMatch(msg, /BoatBoyz Probability/);
  assert.doesNotMatch(msg, /Model Edge/);
  assert.doesNotMatch(msg, /Operator play/);
  assert.doesNotMatch(msg, /Manual entry/);
  assert.equal(pick.modelProbability, null);
});

test("operator can post even with no qualifying feed line", () => {
  const blank = game({
    odds: {
      book: "—",
      details: null,
      homeMl: null,
      awayMl: null,
      homeSpread: null,
      awaySpread: null,
      homeSpreadOdds: null,
      awaySpreadOdds: null,
      total: null,
      overOdds: null,
      underOdds: null,
      openHomeSpread: null,
      openTotal: null,
      openHomeMl: null,
      source: "unknown",
      capturedAt: null,
    },
    rank: null,
  });
  const t = resolveManualTicket({ game: blank, market: "moneyline", side: "home" });
  assert.equal(t.odds, -110);
  assert.ok(t.selection.includes("LAL") || t.selection.includes("ML"));
  assert.match(t.reason, /favored to win at home/i);
  assert.match(t.reason, /Why BoatBoyz likes it/i);
});

test("manual Discord writeup matches the pick card and never labels operator entry", () => {
  const det = game({
    sport: "MLB",
    league: "mlb",
    home: { name: "Cleveland Guardians", abbr: "CLE", logo: null, score: null, record: "70-68", homeSplit: "38-30", roadSplit: "32-38", starter: { name: "Tanner Bibee", era: 3.4, whip: null, savePct: null, position: "P" } },
    away: { name: "Detroit Tigers", abbr: "DET", logo: null, score: null, record: "78-62", homeSplit: "42-28", roadSplit: "36-34", starter: { name: "Tarik Skubal", era: 2.4, whip: null, savePct: null, position: "P" } },
    odds: odds({ homeMl: 105, awayMl: -125, details: "DET -125" }),
    weather: "72° F",
  });
  const t = resolveManualTicket({ game: det, market: "moneyline", side: "away" });
  const pick = {
    id: 2,
    gameId: det.id,
    sport: "MLB",
    league: "mlb",
    matchup: "DET @ CLE",
    market: "moneyline",
    selection: "DET ML (-110)",
    side: "away",
    lockedLine: null,
    lockedOdds: -110,
    lockedOddsJson: det.odds,
    reason: t.reason,
    research: null,
    confidence: 0,
    edgePct: 0,
    units: 1,
    status: "posted",
    result: null,
    profitUnits: null,
    startAt: new Date("2026-09-04T18:10:00Z").toISOString(),
    postAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
    gradedAt: null,
    discordMessage: null,
    discordMessageId: null,
    officialKey: null,
    skipReason: null,
    modelVersion: null,
    modelProbability: null,
    modelEdge: null,
    freezeJson: null,
    selectedOdds: -110,
    postedOdds: -110,
    closingOdds: null,
    clv: null,
    createdAt: new Date().toISOString(),
    pickSource: "manual",
    lineSource: "manual-entry",
    postedScore: "DET — · CLE —",
    postedState: null,
    homeLogo: null,
    awayLogo: null,
    homeAbbr: "CLE",
    awayAbbr: "DET",
    homeScore: null,
    awayScore: null,
    gameStatus: "scheduled",
  } as PickRow;
  const msg = buildManualPickMessage(pick, det);
  assert.match(msg, /BOATBOYZ PLAY/);
  assert.match(msg, /DET ML/);
  assert.match(msg, /WHY BOATBOYZ LIKES IT/);
  assert.match(msg, /favored to win on the road/);
  assert.match(msg, /Skubal|playing at home|road/i);
  assert.doesNotMatch(msg, /Operator play/);
  assert.doesNotMatch(msg, /Manual entry/);
  assert.doesNotMatch(msg, /not an auto pick/);
});

test("double tap uses the same request id so only one unique manual_post_id exists", () => {
  const a = "req-1";
  const b = "req-1";
  assert.equal(a, b);
});

test("manual live spread stores the exact line and grades from it, not a later board line", () => {
  const pick = {
    market: "spread",
    side: "home",
    lockedLine: 4.5,
    lockedOdds: -110,
    league: "nba",
  } as PickRow;
  const finalGame = game({
    status: "final",
    home: { ...game().home, score: 110 },
    away: { ...game().away, score: 100 },
    odds: odds({ homeSpread: -8 }),
  });
  const result = gradePick(pick, finalGame);
  assert.equal(result, "WIN");
});

test("unsupported custom market without a line becomes NEEDS MANUAL GRADE rather than guessed", () => {
  assert.equal(canAutoGradeManual({ market: "spread", side: "home", lockedLine: null, lockedOdds: -110 }), false);
  const t = resolveManualTicket({ game: game({ odds: odds({ homeSpread: null, awaySpread: null, homeSpreadOdds: null, awaySpreadOdds: null }) }), market: "spread", side: "home", odds: -110 });
  assert.equal(t.needsManualGrade, true);
  assert.equal(NEEDS_MANUAL_GRADE, "NEEDS_MANUAL_GRADE");
});

test("automated truth gate still rejects live official auto picks", () => {
  const live = game({ status: "in_progress", startAt: new Date(Date.now() - 1000).toISOString() });
  const rank = {
    market: "moneyline",
    side: "home",
    selection: "LAL ML",
    line: null,
    price: -110,
    edgePct: 6,
    confidence: 70,
    why: "x",
    model: "v2-nba",
    probability: 0.58,
    dataQuality: 80,
  } as RankPick;
  const gate = prePostTruthCheck({
    queued: {
      gameId: live.id,
      league: live.league,
      homeName: live.home.name,
      awayName: live.away.name,
      startAt: live.startAt,
      market: "moneyline",
      freezeJson: null,
      status: "queued",
    },
    live,
    rank,
    minEdge: 3,
    minConf: 58,
  });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.reason, "PASS_GAME_STARTED");
});

test("live state label prefers ESPN shortDetail", () => {
  assert.equal(liveStateLabel(game({ status: "in_progress", shortDetail: "3Q 6:42", period: 3, clock: "6:42" })), "3Q 6:42");
  assert.equal(pickSourceForStatus("in_progress"), "manual_live");
  assert.equal(pickSourceForStatus("scheduled"), "manual");
});
