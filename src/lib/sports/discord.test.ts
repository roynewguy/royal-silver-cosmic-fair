import assert from "node:assert/strict";
import { test } from "node:test";
import { discordWebhookOk, resolveWebhook } from "./discord.ts";

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
