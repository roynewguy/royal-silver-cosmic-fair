import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNoPlayMessage,
  buildShadowLabDigest,
  buildShadowLabMessage,
  canPostShadowLab,
  noPlayEnabled,
  resolveModelLabWebhook,
} from "./shadow-discord.ts";
import { canQueueOfficial } from "../models-v3/registry.ts";
import type { GameCard, ModelCall } from "./types.ts";

test("model lab webhook refuses to collide with official picks", () => {
  const prevLab = process.env.DISCORD_MODEL_LAB_WEBHOOK;
  const prevOff = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_MODEL_LAB_WEBHOOK = "https://discord.com/api/webhooks/1/abc";
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1/abc";
  const hit = resolveModelLabWebhook("https://discord.com/api/webhooks/1/abc");
  assert.equal(hit.url, "");
  assert.match(hit.reason ?? "", /official/);
  process.env.DISCORD_MODEL_LAB_WEBHOOK = "https://discord.com/api/webhooks/9/lab";
  const ok = resolveModelLabWebhook("https://discord.com/api/webhooks/1/abc");
  assert.equal(ok.url, "https://discord.com/api/webhooks/9/lab");
  process.env.DISCORD_MODEL_LAB_WEBHOOK = prevLab;
  process.env.DISCORD_WEBHOOK_URL = prevOff;
});

test("shadow copy is never an official pick and V4 cannot queue official", () => {
  const call: ModelCall = {
    model: "v4-mlb-ensemble",
    probability: 0.587,
    marketProbability: 0.531,
    edgePct: 5.6,
    expectedValuePct: 10.2,
    uncertainty: 0.1,
    dataQuality: 91,
    confidence: 70,
    action: "BET",
    passReason: null,
    official: false,
    price: -118,
    side: "home",
  };
  const game = {
    home: { abbr: "LAD" },
    away: { abbr: "SF" },
  } as GameCard;
  const msg = buildShadowLabMessage(game, call);
  assert.match(msg, /NOT AN OFFICIAL PICK/);
  assert.match(msg, /V4-MLB-ENSEMBLE SHADOW/);
  assert.equal(canQueueOfficial(call.model), false);
  assert.equal(canPostShadowLab({ ...call, official: true }).ok, false);
});

test("no-play copy is optional and never an official ticket", () => {
  const msg = buildNoPlayMessage();
  assert.match(msg, /No qualifying plays/);
  assert.match(msg, /BOAT BOYZ/);
  assert.equal(noPlayEnabled({}), false);
  assert.equal(noPlayEnabled({ DISCORD_NO_PLAY_ENABLED: "1" }), true);
});

test("shadow digest never includes official calls", () => {
  const official: ModelCall = {
    model: "v2-mlb",
    probability: 0.6,
    marketProbability: 0.53,
    edgePct: 7,
    expectedValuePct: 12,
    uncertainty: 0.1,
    dataQuality: 90,
    confidence: 70,
    action: "BET",
    passReason: null,
    official: true,
    price: -118,
    side: "home",
  };
  const shadow: ModelCall = { ...official, model: "v4-mlb-ensemble", official: false };
  const game = {
    league: "mlb",
    home: { abbr: "LAD" },
    away: { abbr: "SF" },
    shadows: { v3: null, v4: shadow },
  } as GameCard;
  const digest = buildShadowLabDigest([game]);
  assert.match(digest ?? "", /NOT AN OFFICIAL PICK/);
  assert.doesNotMatch(digest ?? "", /v2-mlb/);
  const blocked = buildShadowLabDigest([{ ...game, shadows: { v4: official } } as GameCard]);
  assert.equal(blocked, null);
});
