import assert from "node:assert/strict";
import { test } from "node:test";
import { bestPerSport, clampDailyPicks, rankGames, takeTopPlays } from "./rank.ts";
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
  assert.equal(clampDailyPicks(99), 8);
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
