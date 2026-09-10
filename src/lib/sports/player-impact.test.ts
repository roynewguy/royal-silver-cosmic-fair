import assert from "node:assert/strict";
import { test } from "node:test";
import {
  missingPlayerValuePenalty,
  roleFromSignals,
  weightedInjuryImpact,
} from "./player-impact.ts";
import type { GameCard, Injury, OddsSnapshot } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -110,
  awayMl: -110,
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
  source: "odds-api",
  capturedAt: "2026-09-09T12:00:00.000Z",
};

function game(injuries: Injury[], over: Partial<GameCard> = {}): GameCard {
  return {
    id: "nfl:1",
    espnId: "1",
    sport: "NFL",
    league: "nfl",
    startAt: "2026-09-09T20:00:00.000Z",
    status: "scheduled",
    home: { name: "Seahawks", abbr: "SEA", logo: null, score: null, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Broncos", abbr: "DEN", logo: null, score: null, record: "0-1", homeSplit: null, roadSplit: null, starter: null },
    venue: null,
    odds,
    rank: null,
    notes: [],
    injuries,
    weather: null,
    injuriesFetchedAt: "2026-09-09T12:00:00.000Z",
    ...over,
  };
}

test("QB out is franchise; a nameless OUT is unknown, not a superstar", () => {
  assert.equal(roleFromSignals({ sport: "nfl", position: "QB" }), "franchise");
  assert.equal(roleFromSignals({ sport: "nhl", position: "G" }), "franchise");
  assert.equal(roleFromSignals({ sport: "nfl", position: null }), "unknown");
});

test("missing player-value data shrinks confidence instead of inventing impact", () => {
  const named: Injury = { team: "home", player: "Geno", status: "out", position: "QB" };
  const blank: Injury = { team: "home", player: "Mystery", status: "out", position: null };
  const known = missingPlayerValuePenalty(game([named]));
  const unknown = missingPlayerValuePenalty(game([blank]));
  assert.ok(unknown > known);
  assert.ok(unknown > 0);
});

test("starting goalie out outweighs a 4th-liner out", () => {
  const goalie = game(
    [{ team: "away", player: "Helly", status: "out", position: "G" }],
    { league: "nhl", sport: "NHL" },
  );
  const liner = game(
    [{ team: "away", player: "Depth", status: "out", position: "LW" }],
    { league: "nhl", sport: "NHL" },
  );
  assert.ok(weightedInjuryImpact(goalie).away > weightedInjuryImpact(liner).away);
});
