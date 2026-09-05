import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWhy, parseWhy, previewNotes, whyBullets, whyWriteup } from "./why.ts";
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
  assert.ok(bullets.length >= 2 && bullets.length <= 5);
  assert.ok(bullets.some((b) => /home/i.test(b)));
  assert.ok(bullets.some((b) => /Curry/i.test(b)));
  const writeup = whyWriteup(game, rank);
  assert.match(writeup, /Lakers/);
  assert.match(writeup, /home|LeBron|Curry/i);
});

test("MLB why includes weather and both starters", () => {
  const game = {
    league: "mlb",
    sport: "MLB",
    venue: "Petco Park",
    weather: "68° F, light wind",
    home: { name: "Padres", abbr: "SD", record: "76-64", homeSplit: "42-28", starter: { name: "Dylan Cease", era: 3.47, whip: null, savePct: null, position: "P" } },
    away: { name: "Yankees", abbr: "NYY", record: "78-62", roadSplit: "35-38", starter: { name: "Gerrit Cole", era: 3.2, whip: null, savePct: null, position: "P" } },
    injuries: [{ team: "away", player: "Aaron Judge", status: "doubtful", position: "RF" }],
  } as GameCard;
  const rank = { side: "home", why: "", market: "moneyline" } as RankPick;
  const bullets = whyBullets(game, rank);
  assert.ok(bullets.some((b) => /Cease/i.test(b)));
  assert.ok(bullets.some((b) => /weather/i.test(b)));
  assert.ok(bullets.some((b) => /Judge/i.test(b)));
  const formatted = formatWhy(game, rank);
  const parsed = parseWhy(formatted);
  assert.match(parsed.writeup, /Padres/);
  assert.ok(parsed.bullets.length >= 2);
});

test("preview notes stay unofficial facts", () => {
  const game = {
    league: "mlb",
    sport: "MLB",
    home: { name: "Padres", abbr: "SD", record: "76-64", homeSplit: "42-28", starter: null },
    away: { name: "Yankees", abbr: "NYY", record: "78-62", starter: null },
    odds: { homeMl: 104, awayMl: -112, details: "NYY -112" },
    injuries: [],
    weather: null,
    rank: null,
  } as unknown as GameCard;
  const notes = previewNotes(game);
  assert.match(notes.writeup, /Padres/);
  assert.match(notes.writeup, /Yankees|NYY|home/i);
});
