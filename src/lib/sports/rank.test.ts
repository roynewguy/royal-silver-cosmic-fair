import assert from "node:assert/strict";
import { test } from "node:test";
import { bestOnSlate, bestPerSport, clampDailyPicks, countsTowardDailyCap, dailyPickTarget, remainingDailySlots, rankGames, takeTopPlays } from "./rank.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -150,
  awayMl: 130,
  homeSpread: -3.5,
  awaySpread: 3.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 44.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: -3,
  openTotal: 45,
  openHomeMl: -140,
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function card(over: Partial<GameCard> = {}): GameCard {
  const start = over.startAt ?? new Date(Date.now() + 5 * 3600_000).toISOString();
  return {
    id: "nfl:1",
    espnId: "1",
    sport: "NFL",
    league: "nfl",
    startAt: start,
    status: "scheduled",
    home: { name: "Seahawks", abbr: "SEA", logo: null, score: null, record: "10-6", homeSplit: "6-2", roadSplit: "4-4", starter: null },
    away: { name: "Broncos", abbr: "DEN", logo: null, score: null, record: "8-8", homeSplit: "5-3", roadSplit: "3-5", starter: null },
    venue: null,
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

test("soccer leagues are never official picks", () => {
  const games = rankGames([
    card({
      id: "epl:1",
      league: "epl",
      sport: "EPL",
      home: { name: "Arsenal", abbr: "ARS", logo: null, score: null, record: "10-2-3", homeSplit: null, roadSplit: null, starter: null },
      away: { name: "Chelsea", abbr: "CHE", logo: null, score: null, record: "8-4-3", homeSplit: null, roadSplit: null, starter: null },
    }),
  ]);
  assert.equal(games[0]?.rank, null);
  const decisions = bestPerSport(games);
  const epl = decisions.find((d) => d.skip.league === "epl");
  assert.equal(epl?.skip.skipped, true);
  assert.match(epl?.skip.skipReason ?? "", /3-way/);
});

test("official card ignores tomorrow even if the edge is bigger", () => {
  const now = new Date();
  const tonight = new Date(now.getTime() + 4 * 3600_000).toISOString();
  const tomorrow = new Date(now.getTime() + 30 * 3600_000).toISOString();
  const games = rankGames([
    card({ id: "nfl:today", startAt: tonight, home: { name: "Seahawks", abbr: "SEA", logo: null, score: null, record: "11-5", homeSplit: "7-1", roadSplit: "4-4", starter: null }, away: { name: "Rams", abbr: "LAR", logo: null, score: null, record: "9-7", homeSplit: "5-3", roadSplit: "4-4", starter: null } }),
    card({ id: "nfl:tmw", startAt: tomorrow, home: { name: "Chiefs", abbr: "KC", logo: null, score: null, record: "14-2", homeSplit: "8-0", roadSplit: "6-2", starter: null }, away: { name: "Raiders", abbr: "LV", logo: null, score: null, record: "4-12", homeSplit: "3-5", roadSplit: "1-7", starter: null } }),
  ]);
  const nfl = bestPerSport(games, 0, 0, now).find((d) => d.skip.league === "nfl");
  if (!nfl?.skip.skipped) {
    assert.equal(nfl?.pick.id, "nfl:today");
  }
});

test("ESPN odds never become an official pick", () => {
  const now = new Date();
  const kick = new Date(now.getTime() + 20 * 60_000).toISOString();
  const games = rankGames([
    card({
      startAt: kick,
      odds: { ...odds, source: "espn", book: "ESPN" },
    }),
  ]);
  assert.equal(games[0]?.rank, null);
  const nfl = bestPerSport(games, 3, 58, now).find((d) => d.skip.league === "nfl");
  assert.equal(nfl?.skip.skipped, true);
  assert.match(nfl?.skip.skipReason ?? "", /DraftKings/);
});

test("daily card keeps the top N plays and passes the rest", () => {
  assert.equal(clampDailyPicks(3), 3);
  assert.equal(clampDailyPicks(99), 6);
  const decisions = [
    { skip: { skipped: false, sport: "NBA" }, pick: { rank: { edgePct: 6 } } },
    { skip: { skipped: false, sport: "NFL" }, pick: { rank: { edgePct: 4 } } },
    { skip: { skipped: false, sport: "MLB" }, pick: { rank: { edgePct: 3.5 } } },
    { skip: { skipped: true, sport: "NHL" }, pick: { rank: { edgePct: 9 } } },
  ];
  const { take, rest } = takeTopPlays(decisions, 2);
  assert.equal(take.length, 2);
  assert.equal(take[0]?.skip.sport, "NBA");
  assert.equal(take[1]?.skip.sport, "NFL");
  assert.equal(rest.length, 1);
  assert.equal(rest[0]?.skip.sport, "MLB");
});

test("bestOnSlate ranks the whole board, not one per sport", () => {
  const now = new Date();
  const kick = new Date(now.getTime() + 5 * 3600_000).toISOString();
  const nbaA = card({
    id: "nba:1",
    league: "nba",
    sport: "NBA",
    startAt: kick,
    rank: { edgePct: 8, confidence: 70, market: "moneyline", side: "home", selection: "Lakers ML", line: null, price: -135, probability: 0.6, why: "home", model: "v2-nba" },
  });
  const nbaB = card({
    id: "nba:2",
    league: "nba",
    sport: "NBA",
    startAt: kick,
    rank: { edgePct: 6, confidence: 66, market: "spread", side: "home", selection: "LAL -3", line: -3, price: -110, probability: 0.58, why: "home", model: "v2-nba" },
  });
  const nhl = card({
    id: "nhl:1",
    league: "nhl",
    sport: "NHL",
    startAt: kick,
    home: { name: "Kings", abbr: "LAK", logo: null, score: null, record: "10-6", homeSplit: "6-2", roadSplit: "4-4", starter: null },
    away: { name: "Ducks", abbr: "ANA", logo: null, score: null, record: "8-8", homeSplit: "5-3", roadSplit: "3-5", starter: null },
    rank: { edgePct: 3.2, confidence: 60, market: "moneyline", side: "home", selection: "Kings ML", line: null, price: -120, probability: 0.55, why: "home ice", model: "v2-nhl" },
  });
  const ranked = bestOnSlate([nbaA, nbaB, nhl], 3, 58, now);
  assert.equal(ranked.length, 3);
  assert.deepEqual(ranked.map((g) => g.id), ["nba:1", "nba:2", "nhl:1"]);
  assert.equal(ranked.slice(0, 2).every((g) => g.sport === "NBA"), true);
});

test("bestOnSlate posts fewer than target when few qualify, and none if none qualify", () => {
  const now = new Date();
  const kick = new Date(now.getTime() + 5 * 3600_000).toISOString();
  const one = card({
    startAt: kick,
    rank: { edgePct: 5, confidence: 62, market: "spread", side: "home", selection: "SEA -3", line: -3, price: -110, probability: 0.57, why: "home", model: "v2-nfl" },
  });
  const weak = card({
    id: "nfl:2",
    startAt: kick,
    rank: { edgePct: 1, confidence: 52, market: "spread", side: "away", selection: "DEN +3", line: 3, price: -110, probability: 0.51, why: "no", model: "v2-nfl" },
  });
  assert.equal(bestOnSlate([one, weak], 3, 58, now).length, 1);
  assert.equal(bestOnSlate([weak], 3, 58, now).length, 0);
  const started = card({
    startAt: new Date(now.getTime() - 60_000).toISOString(),
    status: "in_progress",
    rank: { edgePct: 9, confidence: 80, market: "spread", side: "home", selection: "SEA -3", line: -3, price: -110, probability: 0.7, why: "live", model: "v2-nfl" },
  });
  assert.equal(bestOnSlate([started], 3, 58, now).length, 0);
});

test("DAILY_PICK_TARGET env wins over desk setting", () => {
  assert.equal(dailyPickTarget(5, { DAILY_PICK_TARGET: "3" }), 3);
  assert.equal(dailyPickTarget(2, {}), 2);
});

test("true PT daily maximum: posted+graded fill the cap", () => {
  assert.equal(remainingDailySlots(3, 0), 3);
  assert.equal(remainingDailySlots(3, 2), 1);
  assert.equal(remainingDailySlots(3, 3), 0);
  assert.equal(remainingDailySlots(3, 4), 0);
});

test("skipped PASS tickets do not count toward the daily cap", () => {
  const statuses = ["queued", "posting", "posted", "graded", "skipped", "skipped"];
  const committed = statuses.filter(countsTowardDailyCap).length;
  assert.equal(committed, 4);
  assert.equal(remainingDailySlots(6, committed), 2);
  assert.equal(countsTowardDailyCap("skipped"), false);
  assert.equal(countsTowardDailyCap("queued"), true);
  assert.equal(clampDailyPicks(8), 6);
  assert.equal(clampDailyPicks(0), 1);
});

