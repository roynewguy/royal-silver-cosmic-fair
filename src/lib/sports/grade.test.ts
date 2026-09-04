import assert from "node:assert/strict";
import { test } from "node:test";
import { gradePick } from "./grade.ts";
import type { GameCard, OddsSnapshot, PickRow } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -120,
  awayMl: 100,
  homeSpread: -3.5,
  awaySpread: 3.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 45.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: -3,
  openTotal: 46,
  openHomeMl: -115,
  source: "odds-api",
  capturedAt: null,
};

function game(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "nfl:1",
    espnId: "1",
    sport: "NFL",
    league: "nfl",
    startAt: new Date().toISOString(),
    status: "final",
    home: { name: "Seahawks", abbr: "SEA", logo: null, score: 27, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Broncos", abbr: "DEN", logo: null, score: 20, record: "0-1", homeSplit: null, roadSplit: null, starter: null },
    venue: null,
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

function pick(over: Partial<PickRow> = {}): PickRow {
  return {
    id: 1,
    gameId: "nfl:1",
    sport: "NFL",
    league: "nfl",
    matchup: "DEN @ SEA",
    market: "spread",
    selection: "SEA -3.5",
    side: "home",
    lockedLine: -3.5,
    lockedOdds: -110,
    lockedOddsJson: odds,
    reason: "test",
    research: null,
    confidence: 64,
    edgePct: 4,
    units: 1,
    status: "posted",
    result: null,
    profitUnits: null,
    startAt: new Date().toISOString(),
    postAt: new Date().toISOString(),
    postedAt: null,
    gradedAt: null,
    discordMessage: null,
    discordMessageId: null,
    officialKey: "nfl:nfl:1:official",
    skipReason: null,
    modelVersion: "v2-nfl",
    modelProbability: 0.57,
    modelEdge: 4,
    freezeJson: null,
    selectedOdds: -110,
    postedOdds: -110,
    closingOdds: null,
    clv: null,
    createdAt: new Date().toISOString(),
    homeLogo: null,
    awayLogo: null,
    homeAbbr: "SEA",
    awayAbbr: "DEN",
    homeScore: 27,
    awayScore: 20,
    gameStatus: "final",
    ...over,
  } as PickRow;
}

test("spread home cover is a win", () => {
  assert.equal(gradePick(pick(), game()), "WIN");
});

test("spread landing on the number is a push", () => {
  assert.equal(gradePick(pick({ lockedLine: -7 }), game()), "PUSH");
});

test("soccer 3-way ML draw is a LOSS not a push", () => {
  const g = game({
    league: "epl",
    sport: "EPL",
    home: { name: "Arsenal", abbr: "ARS", logo: null, score: 1, record: "8-2-3", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Chelsea", abbr: "CHE", logo: null, score: 1, record: "7-3-3", homeSplit: null, roadSplit: null, starter: null },
  });
  const p = pick({
    league: "epl",
    sport: "EPL",
    market: "moneyline",
    side: "home",
    selection: "ARS ML",
    lockedLine: null,
  });
  assert.equal(gradePick(p, g), "LOSS");
});

test("NFL moneyline tie is a push", () => {
  const g = game({
    home: { name: "Seahawks", abbr: "SEA", logo: null, score: 20, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Broncos", abbr: "DEN", logo: null, score: 20, record: "0-1", homeSplit: null, roadSplit: null, starter: null },
  });
  assert.equal(gradePick(pick({ market: "moneyline", side: "home", lockedLine: null }), g), "PUSH");
});

test("postponed game voids the ticket", () => {
  assert.equal(gradePick(pick(), game({ status: "postponed" })), "VOID");
});

test("cancelled game voids the ticket", () => {
  assert.equal(gradePick(pick(), game({ status: "cancelled" })), "VOID");
});

test("in-progress does not grade", () => {
  assert.equal(gradePick(pick(), game({ status: "in_progress" })), null);
});
