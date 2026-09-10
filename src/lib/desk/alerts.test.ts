import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOwnerAlert, isAlertMuted, parseAlertMap, resolveAlertWebhook, shouldAlert, discordAlertCode } from "./alerts.ts";

test("alert cooldown is honored on a durable map", () => {
  const store = new Map<string, number>();
  const t0 = Date.parse("2026-09-04T20:00:00Z");
  assert.equal(shouldAlert("DISCORD_FAIL", t0, 30 * 60_000, store), true);
  assert.equal(shouldAlert("DISCORD_FAIL", t0 + 5 * 60_000, 30 * 60_000, store), false);
  assert.equal(shouldAlert("ESPN_FAIL", t0 + 5 * 60_000, 30 * 60_000, store), true);
  assert.equal(shouldAlert("DISCORD_FAIL", t0 + 31 * 60_000, 30 * 60_000, store), true);
});

test("alert map parses persisted JSON and ignores junk", () => {
  assert.deepEqual(parseAlertMap('{"DISCORD_FAIL": 100}'), { DISCORD_FAIL: 100 });
  assert.deepEqual(parseAlertMap({ ESPN_FAIL: "200" }), { ESPN_FAIL: 200 });
  assert.deepEqual(parseAlertMap("not-json"), {});
  assert.deepEqual(parseAlertMap(null), {});
});

test("owner alert webhook never reuses the customer pick webhook", () => {
  assert.equal(
    resolveAlertWebhook({
      DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
      DISCORD_ALERT_WEBHOOK: "https://discord.com/api/webhooks/1/abc",
    }),
    "",
  );
  assert.equal(
    resolveAlertWebhook({
      DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
      DISCORD_ALERT_WEBHOOK: "https://discord.com/api/webhooks/2/def",
    }),
    "https://discord.com/api/webhooks/2/def",
  );
});

test("owner alert copy is not a customer pick", () => {
  const text = formatOwnerAlert("DISCORD_FAIL", "timeout");
  assert.match(text, /CRITICAL DISCORD_FAIL/);
  assert.match(text, /not a customer pick/i);
});

test("discord alert codes isolate 401/403 from unknown delivery", () => {
  assert.equal(discordAlertCode({ authFailure: true, error: "Discord HTTP 401" }), "DISCORD_401");
  assert.equal(discordAlertCode({ authFailure: true, error: "Discord HTTP 403" }), "DISCORD_403");
  assert.equal(discordAlertCode({ uncertain: true, error: "timeout" }), "DISCORD_DELIVERY_UNKNOWN");
});

test("isAlertMuted parses comma/space/colon lists case-insensitively", () => {
  assert.equal(isAlertMuted("MARKET_FEED_STALE", {}), false);
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: "" }), false);
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: "   " }), false);
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: "MARKET_FEED_STALE" }), true);
  assert.equal(isAlertMuted("market_feed_stale", { ALERT_MUTE_CODES: "Market_Feed_Stale" }), true);
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: "ESPN_FAIL, MARKET_FEED_STALE, INJURY_FEED_STALE" }), true);
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: "ESPN_FAIL MARKET_FEED_STALE INJURY_FEED_STALE" }), true);
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: "ESPN_FAIL:MARKET_FEED_STALE:INJURY_FEED_STALE" }), true);
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: "ESPN_FAIL,INJURY_FEED_STALE" }), false);
  assert.equal(isAlertMuted("ESPN_FAIL", { ALERT_MUTE_CODES: "MARKET_FEED_STALE" }), false);
  assert.equal(isAlertMuted("DISCORD_FAIL", { ALERT_MUTE_CODES: "market_feed_stale , discord_fail" }), true);
});

test("isAlertMuted empty env means none muted", () => {
  assert.equal(isAlertMuted("MARKET_FEED_STALE", { ALERT_MUTE_CODES: undefined }), false);
  assert.equal(isAlertMuted("CRON_STALE", {}), false);
});
