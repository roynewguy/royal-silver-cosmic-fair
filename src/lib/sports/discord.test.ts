import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDiscordMessage, discordWebhookOk, favoredLine, resolveWebhook } from "./discord.ts";
import type { GameCard, PickRow } from "./types.ts";

test("rejects non-discord urls", () => {
  assert.equal(discordWebhookOk("https://example.com/api/webhooks/1/x"), false);
  assert.equal(discordWebhookOk("http://discord.com/api/webhooks/1/x"), false);
});

test("accepts discord webhook urls", () => {
  assert.equal(discordWebhookOk("https://discord.com/api/webhooks/123/abc"), true);
  assert.equal(discordWebhookOk("https://discordapp.com/api/webhooks/123/abc"), true);
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
    reason: "Why BoatBoyz likes it:\n* Lakers are playing at home\n* key starter is available",
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
  assert.match(msg, /Lakers ML vs Warriors/);
  assert.match(msg, /BoatBoyz Probability: 60%/);
  assert.match(msg, /DraftKings at posting: -135/);
  assert.match(msg, /Units: 1\.0U/);
  assert.match(msg, /Score: Not started/);
  assert.doesNotMatch(msg, /Favored /);
  assert.doesNotMatch(msg, /current DK/i);
  assert.doesNotMatch(msg, /ESPN/);
});
