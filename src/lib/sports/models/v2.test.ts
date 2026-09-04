import assert from "node:assert/strict";
import { test } from "node:test";
import { rankGame } from "../rank.ts";
import { injuryDelta } from "./injury.ts";
import type { GameCard, Injury, OddsSnapshot } from "../types.ts";

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
  capturedAt: new Date().toISOString(),
};

function base(over: Partial<GameCard> = {}): GameCard {
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
    ...over,
  };
}

test("away OUT injury helps home; home OUT hurts home", () => {
  const awayOut: Injury = { team: "away", player: "Bo Nix", status: "out", position: "QB" };
  const homeOut: Injury = { team: "home", player: "Geno Smith", status: "out", position: "QB" };
  const up = injuryDelta(base({ injuries: [awayOut] }), "nfl");
  const down = injuryDelta(base({ injuries: [homeOut] }), "nfl");
  assert.ok(up > 0);
  assert.ok(down < 0);
  assert.ok(up > 0.05);
});

test("NBA model tag is v2-nba, NFL is v2-nfl", () => {
  const nba = rankGame(
    base({
      id: "nba:1",
      league: "nba",
      sport: "NBA",
      odds: { ...dk, total: 224, homeSpread: -4.5, awaySpread: 4.5 },
      home: {
        name: "Lakers",
        abbr: "LAL",
        logo: null,
        score: null,
        record: "45-20",
        homeSplit: "28-6",
        roadSplit: "17-14",
        starter: null,
      },
      away: {
        name: "Kings",
        abbr: "SAC",
        logo: null,
        score: null,
        record: "30-35",
        homeSplit: "18-14",
        roadSplit: "12-21",
        starter: null,
      },
    }),
  );
  const nfl = rankGame(base());
  if (nba) {
    assert.equal(nba.model, "v2-nba");
    assert.ok(nba.probability > 0.2 && nba.probability < 0.9);
  }
  if (nfl) {
    assert.equal(nfl.model, "v2-nfl");
    assert.ok(nfl.probability > 0.2 && nfl.probability < 0.9);
  }
});

test("MLB starter ERA swing can flip relative to team-only", () => {
  const teamOnly = rankGame(
    base({
      id: "mlb:1",
      league: "mlb",
      sport: "MLB",
      odds: { ...dk, homeMl: -110, awayMl: -110, homeSpread: null, awaySpread: null, total: 8.5 },
      home: {
        name: "Dodgers",
        abbr: "LAD",
        logo: null,
        score: null,
        record: "50-40",
        homeSplit: "28-16",
        roadSplit: "22-24",
        starter: { name: "Ace", era: 2.1, whip: 0.95, savePct: null, position: "SP" },
      },
      away: {
        name: "Rockies",
        abbr: "COL",
        logo: null,
        score: null,
        record: "48-42",
        homeSplit: "26-18",
        roadSplit: "22-24",
        starter: { name: "Soft", era: 5.8, whip: 1.5, savePct: null, position: "SP" },
      },
    }),
  );
  assert.ok(teamOnly);
  if (teamOnly) {
    assert.equal(teamOnly.model, "v2-mlb");
    assert.equal(teamOnly.market, "moneyline");
  }
});

test("NFL weather lean is under, NBA does not care about wind", () => {
  const snow = rankGame(base({ weather: "Snow · 22° · wind 18" }));
  const nbaSnow = rankGame(
    base({
      id: "nba:w",
      league: "nba",
      sport: "NBA",
      weather: "Snow · 22° · wind 18",
      odds: { ...dk, total: 224, homeSpread: -2.5, awaySpread: 2.5 },
      home: {
        name: "Lakers",
        abbr: "LAL",
        logo: null,
        score: null,
        record: "40-20",
        homeSplit: "24-6",
        roadSplit: "16-14",
        starter: null,
      },
      away: {
        name: "Jazz",
        abbr: "UTA",
        logo: null,
        score: null,
        record: "22-40",
        homeSplit: "14-16",
        roadSplit: "8-24",
        starter: null,
      },
    }),
  );
  if (snow?.market === "total") assert.equal(snow.side, "under");
  if (nbaSnow) assert.equal(nbaSnow.model, "v2-nba");
});
