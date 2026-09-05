import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDiscordMessage,
  buildOperatorPost,
  buildTestPreviewMessage,
  discordWebhookOk,
  favoredLine,
  resolveWebhook,
} from "./discord.ts";
import type { GameCard, PickRow } from "./types.ts";

test("rejects non-discord urls", () => {
  assert.equal(discordWebhookOk("https://example.com/api/webhooks/1/x"), false);
  assert.equal(discordWebhookOk("http://discord.com/api/webhooks/1/x"), false);
});

test("accepts discord webhook urls", () => {
  assert.equal(discordWebhookOk("https://discord.com/api/webhooks/123/abc"), true);
  assert.equal(discordWebhookOk("https://discordapp.com/api/webhooks/123/abc"), true);
});

test("operator freeform posts send the typed text and skip empty", () => {
  assert.equal(buildOperatorPost("   "), null);
  assert.equal(buildOperatorPost(""), null);
  const msg = buildOperatorPost("  Lakers ML tonight, fading the public  ");
  assert.equal(msg, "Lakers ML tonight, fading the public");
  assert.equal(buildOperatorPost("x".repeat(2000))?.length, 1900);
});


test("env webhook beats stored desk webhook", () => {
  const prev = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/env/token";
  const r = resolveWebhook("https://discord.com/api/webhooks/desk/token");
  assert.equal(r.source, "env");
  assert.match(r.url, /env\/token$/);
  if (prev === undefined) delete process.env.DISCORD_WEBHOOK_URL;
  else process.env.DISCORD_WEBHOOK_URL = prev;
});

test("play card has pick, favored %, units, score, and line", () => {
  const pick = {
    id: 9,
    sport: "NBA",
    selection: "Lakers ML",
    matchup: "GSW @ LAL",
    market: "moneyline",
    side: "home",
    lockedOdds: -135,
    lockedLine: null,
    units: 1,
    confidence: 67,
    modelProbability: 0.6,
    modelEdge: 3,
    edgePct: 3,
    modelVersion: "v2-nba",
    reason:
      "Lakers get the home spot against Warriors.\nWhy BoatBoyz likes it:\n* Lakers are playing at home\n* opponent is missing Stephen Curry",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api" },
  } as PickRow;
  const game = {
    status: "scheduled",
    away: { name: "Warriors", abbr: "GSW", score: null },
    home: { name: "Lakers", abbr: "LAL", score: null },
  } as GameCard;
  const msg = buildDiscordMessage(pick, game);
  assert.equal(favoredLine(pick), "BoatBoyz Probability: 60%");
  assert.match(msg, /BOATBOYZ OFFICIAL PLAY/);
  assert.match(msg, /\*\*Lakers ML\*\*/);
  assert.match(msg, /vs Warriors/);
  assert.match(msg, /BoatBoyz 60%/);
  assert.match(msg, /Market /);
  assert.match(msg, /Edge /);
  assert.match(msg, /DraftKings: -135/);
  assert.match(msg, /1\.0U/);
  assert.match(msg, /WHY BOATBOYZ LIKES IT/);
  assert.match(msg, /playing at home/);
  assert.match(msg, /Score: Not started/);
  assert.match(msg, /Model v2-nba/);
  assert.doesNotMatch(msg, /Favored /);
  assert.doesNotMatch(msg, /current DK/i);
  assert.doesNotMatch(msg, /ESPN/);
});

test("test preview is labeled unofficial and includes desk notes", () => {
  const game = {
    sport: "MLB",
    league: "mlb",
    status: "scheduled",
    startAt: new Date("2026-09-04T01:40:00Z").toISOString(),
    away: { name: "Yankees", abbr: "NYY", score: null, record: "78-62", starter: { name: "Gerrit Cole", era: 3.2, whip: null, savePct: null, position: "P" } },
    home: { name: "Padres", abbr: "SD", score: null, record: "76-64", homeSplit: "42-28", starter: { name: "Dylan Cease", era: 3.5, whip: null, savePct: null, position: "P" } },
    odds: { details: "NYY -112", homeMl: 104, awayMl: -112, source: "espn" },
    injuries: [{ team: "home", player: "Fernando Tatis Jr.", status: "out", position: "RF" }],
    weather: "68° F, 8 mph",
    venue: "Petco Park",
    rank: null,
  } as GameCard;
  const msg = buildTestPreviewMessage(game);
  assert.match(msg, /TEST PREVIEW — NOT AN OFFICIAL PICK/);
  assert.match(msg, /MLB/);
  assert.match(msg, /NYY @ SD/);
  assert.match(msg, /Current odds: NYY -112/);
  assert.match(msg, /DESK NOTES/);
  assert.match(msg, /home/);
  assert.match(msg, /Tatis|weather|Cease|Cole/i);
  assert.match(msg, /not an official BoatBoyz play/i);
});
