import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDiscordMessage, discordWebhookOk, favoredLine, resolveWebhook, scoreLine } from "./discord.ts";
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
    matchup: "MIN @ LAL",
    market: "moneyline",
    lockedOdds: -185,
    lockedLine: null,
    units: 1,
    confidence: 62,
    modelProbability: 0.62,
    reason: "Lakers are favored at home (7-1 home split).",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings" },
  } as PickRow;
  const game = {
    status: "scheduled",
    away: { abbr: "MIN", score: null },
    home: { abbr: "LAL", score: null },
  } as GameCard;
  const msg = buildDiscordMessage(pick, game);
  assert.match(msg, /Lakers ML/);
  assert.match(msg, /Favored 62% · 1 units/);
  assert.match(msg, /Score: not started/);
  assert.match(msg, /DraftKings -185/);
  assert.match(msg, /favored at home/);
  assert.equal(favoredLine(pick), "Favored 62% · 1 units");
  assert.equal(scoreLine(game), "Score: not started");
});
