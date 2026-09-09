import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMarketConsensus, median, quotesFromEvent } from "./market-consensus.ts";

test("median and consensus no-vig from DK/FD/MGM/Caesars", () => {
  assert.equal(median([-115, -120, -118, -116]), -117);
  const quotes = [
    { sportsbook: "DraftKings", key: "draftkings", homePrice: -115, awayPrice: -105 },
    { sportsbook: "FanDuel", key: "fanduel", homePrice: -120, awayPrice: 100 },
    { sportsbook: "BetMGM", key: "betmgm", homePrice: -118, awayPrice: -102 },
    { sportsbook: "Caesars", key: "williamhill_us", homePrice: -116, awayPrice: -104 },
  ];
  const c = buildMarketConsensus(quotes);
  assert.ok(c);
  assert.equal(c.bestHome, -115);
  assert.ok(c.dispersion >= 0);
  assert.ok(c.noVigHome != null && c.noVigHome > 0.5);
});

test("parser reads extra books without using them as the official line", () => {
  const event = {
    home_team: "Los Angeles Dodgers",
    away_team: "San Francisco Giants",
    bookmakers: [
      { key: "draftkings", title: "DraftKings", markets: [{ key: "h2h", outcomes: [{ name: "Los Angeles Dodgers", price: -130 }, { name: "San Francisco Giants", price: 110 }] }] },
      { key: "fanduel", title: "FanDuel", markets: [{ key: "h2h", outcomes: [{ name: "Los Angeles Dodgers", price: -125 }, { name: "San Francisco Giants", price: 105 }] }] },
    ],
  };
  const quotes = quotesFromEvent(event, "Los Angeles Dodgers", "San Francisco Giants");
  assert.equal(quotes.length, 2);
  assert.equal(quotes.find((q) => q.key === "draftkings")?.homePrice, -130);
});
