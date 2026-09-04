import assert from "node:assert/strict";
import { test } from "node:test";
import { canSpendOddsCredit, isFreeBetaMode, marketParam, oddsBudget } from "./free-beta.ts";
import { oddsApiUrl, parseUsageHeaders } from "./odds-api.ts";

test("FREE_BETA_MODE parses truthy flags", () => {
  assert.equal(isFreeBetaMode({}), false);
  assert.equal(isFreeBetaMode({ FREE_BETA_MODE: "true" }), true);
  assert.equal(isFreeBetaMode({ FREE_BETA_MODE: "1" }), true);
  assert.equal(isFreeBetaMode({ FREE_BETA_MODE: "no" }), false);
});

test("budget rungs", () => {
  assert.equal(oddsBudget(400), "normal");
  assert.equal(oddsBudget(150), "final-only");
  assert.equal(oddsBudget(50), "final-only");
  assert.equal(oddsBudget(49), "one-shot");
  assert.equal(oddsBudget(0), "frozen");
});

test("only the needed market is requested", () => {
  assert.equal(marketParam("moneyline"), "h2h");
  assert.equal(marketParam("spread"), "spreads");
  assert.equal(marketParam("total"), "totals");
  const url = oddsApiUrl("americanfootball_nfl", "k", "spreads");
  assert.match(url, /markets=spreads/);
  assert.doesNotMatch(url, /h2h/);
  assert.doesNotMatch(url, /totals/);
});

test("spend rules: freeze at 0, cap two checks, skip fresh cache", () => {
  assert.equal(canSpendOddsCredit({ remaining: 0, checksAlready: 0, cacheAgeMs: null }).fetch, false);
  assert.equal(canSpendOddsCredit({ remaining: 200, checksAlready: 2, cacheAgeMs: 60_000 }).fetch, false);
  assert.equal(canSpendOddsCredit({ remaining: 200, checksAlready: 0, cacheAgeMs: 60_000 }).fetch, false);
  assert.equal(canSpendOddsCredit({ remaining: 200, checksAlready: 0, cacheAgeMs: null }).fetch, true);
  assert.equal(canSpendOddsCredit({ remaining: 80, checksAlready: 1, cacheAgeMs: 5 * 60_000 }).fetch, false);
  assert.equal(canSpendOddsCredit({ remaining: 20, checksAlready: 1, cacheAgeMs: 40 * 60_000 }).fetch, false);
});

test("usage headers parse remaining/used/last", () => {
  const headers = {
    get: (k: string) =>
      ({ "x-requests-remaining": "412", "x-requests-used": "88", "x-requests-last": "1" }[k] ?? null),
  };
  assert.deepEqual(parseUsageHeaders(headers), { remaining: 412, used: 88, last: 1 });
});

test("free beta ranks ESPN lines; default mode does not", async () => {
  const prev = process.env.FREE_BETA_MODE;
  const { gate } = await import("./models/common.ts");
  const { rankNfl } = await import("./models/nfl.ts");
  const game = {
    status: "scheduled",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    home: { abbr: "SEA", record: "10-6", homeSplit: "7-1", roadSplit: "3-5", starter: null, name: "Seahawks" },
    away: { abbr: "DEN", record: "8-8", homeSplit: "5-3", roadSplit: "3-5", starter: null, name: "Broncos" },
    odds: {
      book: "ESPN",
      source: "espn",
      homeMl: -140,
      awayMl: 120,
      homeSpread: -3,
      awaySpread: 3,
      homeSpreadOdds: -110,
      awaySpreadOdds: -110,
      total: 44,
      overOdds: -110,
      underOdds: -110,
      openHomeSpread: -3,
      openTotal: 44,
      openHomeMl: -140,
      details: null,
      capturedAt: null,
    },
    injuries: [],
    notes: [],
    weather: null,
  } as unknown as import("./types.ts").GameCard;
  process.env.FREE_BETA_MODE = "";
  assert.equal(gate(game), false);
  process.env.FREE_BETA_MODE = "true";
  try {
    assert.equal(gate(game), true);
    const ranked = rankNfl(game);
    assert.ok(ranked);
    assert.equal(game.odds.source, "espn");
  } finally {
    if (prev === undefined) delete process.env.FREE_BETA_MODE;
    else process.env.FREE_BETA_MODE = prev;
  }
});
