import assert from "node:assert/strict";
import { test } from "node:test";
import { canOperatorPost, operatorPostChoices } from "./post-choices.ts";
import type { GameCard } from "./types.ts";

const blankOdds = {
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
  source: "unknown" as const,
  capturedAt: null,
};

function game(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "1",
    espnId: "1",
    sport: "MLS",
    league: "mls",
    startAt: new Date().toISOString(),
    status: "scheduled",
    period: null,
    clock: null,
    shortDetail: null,
    venue: null,
    weather: null,
    notes: [],
    injuries: [],
    home: { name: "LAFC", abbr: "LAFC", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Galaxy", abbr: "LAG", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    odds: blankOdds,
    rank: null,
    ...over,
  };
}

test("blank odds produce no invented -110 choices", () => {
  const choices = operatorPostChoices(game());
  assert.equal(choices.length, 0);
  assert.equal(canOperatorPost(game()), true);
  assert.equal(canOperatorPost(game({ status: "cancelled" })), false);
  assert.equal(canOperatorPost(game({ status: "final" })), false);
  assert.equal(canOperatorPost(game({ status: "suspended" })), false);
});

test("feed lines are used when present", () => {
  const choices = operatorPostChoices(
    game({
      sport: "NBA",
      league: "nba",
      odds: {
        ...blankOdds,
        book: "DraftKings",
        source: "odds-api",
        homeMl: -140,
        awayMl: 120,
        homeSpread: -3.5,
        awaySpread: 3.5,
        homeSpreadOdds: -110,
        awaySpreadOdds: -110,
        total: 224.5,
        overOdds: -108,
        underOdds: -112,
      },
      home: { name: "Lakers", abbr: "LAL", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
      away: { name: "Celtics", abbr: "BOS", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    }),
  );
  assert.equal(choices.find((c) => c.market === "moneyline" && c.side === "home")?.price, -140);
  assert.equal(choices.find((c) => c.market === "spread" && c.side === "home")?.line, -3.5);
  assert.equal(choices.find((c) => c.market === "total" && c.side === "over")?.line, 224.5);
});

test("stale live stored odds are not offered as post choices", () => {
  const choices = operatorPostChoices(
    game({
      status: "in_progress",
      odds: {
        ...blankOdds,
        book: "DraftKings",
        source: "odds-api",
        homeMl: -140,
        awayMl: 120,
        capturedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
    }),
  );
  assert.equal(choices.length, 0);
});
