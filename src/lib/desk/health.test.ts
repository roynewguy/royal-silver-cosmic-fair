import assert from "node:assert/strict";
import { test } from "node:test";
import { automationStatus, buildDeskHealth, nextScanIso } from "./health.ts";

test("no cron tick means automation is not armed", () => {
  assert.equal(automationStatus(null), "unarmed");
  assert.equal(automationStatus(""), "unarmed");
});

test("tick age maps to online / delayed / offline", () => {
  const now = Date.parse("2026-09-05T03:00:00.000Z");
  assert.equal(automationStatus(new Date(now - 8 * 60_000).toISOString(), now), "online");
  assert.equal(automationStatus(new Date(now - 20 * 60_000).toISOString(), now), "delayed");
  assert.equal(automationStatus(new Date(now - 34 * 60_000).toISOString(), now), "offline");
});

test("loading the app does not count as a tick", () => {
  const health = buildDeskHealth({
    lastTickAt: null,
    lastScanAt: new Date().toISOString(),
    hasWebhook: true,
    dbSource: "neon",
    espnErrors: 0,
    oddsRemaining: 400,
    oddsUsed: 10,
    freeBeta: true,
  });
  assert.equal(health.automation, "unarmed");
  assert.equal(health.discord, "ok");
});

test("next scan is 10 minutes after last cron", () => {
  const last = "2026-09-05T03:00:00.000Z";
  assert.equal(nextScanIso(last, null), "2026-09-05T03:10:00.000Z");
});
