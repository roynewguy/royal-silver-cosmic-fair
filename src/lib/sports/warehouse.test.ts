import assert from "node:assert/strict";
import { test } from "node:test";
import { packPregameFeatures } from "./warehouse.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: 135,
  awayMl: -163,
  homeSpread: 1.5,
  awaySpread: -1.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: 1.5,
  openTotal: 8.5,
  openHomeMl: 140,
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function game(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:1",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Marlins", abbr: "MIA", logo: null, score: 7, record: "70-70", homeSplit: "40-30", roadSplit: "30-40", starter: { name: "Junk", era: 4.1, whip: 1.3, savePct: null, position: "SP" } },
    away: { name: "Cubs", abbr: "CHC", logo: null, score: 2, record: "80-60", homeSplit: "42-28", roadSplit: "38-32", starter: { name: "Imanaga", era: 4.0, whip: 1.1, savePct: null, position: "SP" } },
    venue: "loanDepot park",
    odds,
    rank: { market: "moneyline", side: "home", selection: "MIA ML", line: null, price: 135, edgePct: 4.4, confidence: 62, why: "x", model: "v2-mlb", probability: 0.468 },
    notes: [],
    injuries: [{ team: "away", player: "Star", status: "out", position: "SS" }],
    weather: "78° wind 8 out",
    ...over,
  };
}

test("pregame features never include scores", () => {
  const feats = packPregameFeatures(game());
  assert.ok(feats);
  assert.equal("homeScore" in feats, false);
  assert.equal("awayScore" in feats, false);
  assert.equal(JSON.stringify(feats).includes("\"score\""), false);
  assert.equal(feats.homeOut, 0);
  assert.equal(feats.awayOut, 1);
  assert.equal(feats.homeStarter?.name, "Junk");
});

test("started or live games are not written as pregame", () => {
  assert.equal(packPregameFeatures(game({ startAt: new Date(Date.now() - 1000).toISOString() })), null);
  assert.equal(packPregameFeatures(game({ status: "in_progress" })), null);
  assert.equal(packPregameFeatures(game({ status: "final" })), null);
});
