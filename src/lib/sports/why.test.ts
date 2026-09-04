import assert from "node:assert/strict";
import { test } from "node:test";
import { whyBullets } from "./why.ts";
import type { GameCard, RankPick } from "./types.ts";

test("why bullets stay short and mention home plus opponent out", () => {
  const game = {
    league: "nba",
    sport: "NBA",
    home: { name: "Lakers", abbr: "LAL", record: "10-6", homeSplit: "7-1", roadSplit: "3-5", starter: { name: "LeBron James", era: null, whip: null, savePct: null, position: "F" } },
    away: { name: "Warriors", abbr: "GSW", record: "8-8", homeSplit: "5-3", roadSplit: "3-5", starter: null },
    injuries: [{ team: "away", player: "Stephen Curry", status: "out", position: "G" }],
    weather: null,
  } as GameCard;
  const rank = { side: "home", why: "home split vs road.", market: "moneyline" } as RankPick;
  const bullets = whyBullets(game, rank);
  assert.ok(bullets.length >= 2 && bullets.length <= 4);
  assert.ok(bullets.some((b) => /home/i.test(b)));
  assert.ok(bullets.some((b) => /Curry/i.test(b)));
});
