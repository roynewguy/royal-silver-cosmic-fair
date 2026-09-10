import assert from "node:assert/strict";
import { test } from "node:test";
import { automationStatus, buildDeskHealth, nextScanIso, oddsQuotaLabel, oddsService } from "./health.ts";

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
  assert.equal(health.discord, "warn");
  assert.equal(health.pendingGrades, 0);
  assert.equal(health.shadowSoak, false);
  assert.equal(health.deliveryUnknown, 0);
  assert.equal(health.soakRecorderFailed, false);
  assert.equal(health.soakWouldHavePosted, null);
});

test("next scan is 10 minutes after last cron", () => {
  const last = "2026-09-05T03:00:00.000Z";
  assert.equal(nextScanIso(last, null), "2026-09-05T03:10:00.000Z");
});

test("odds quota levels are warning / critical / exhausted and never silent", () => {
  assert.equal(oddsService(400), "ok");
  assert.equal(oddsService(150), "warn");
  assert.equal(oddsService(49), "bad");
  assert.equal(oddsService(0), "bad");
  assert.match(oddsQuotaLabel(0), /EXHAUSTED/);
  assert.match(oddsQuotaLabel(20), /CRITICAL/);
  assert.match(oddsQuotaLabel(120), /WARNING/);
  const health = buildDeskHealth({
    lastTickAt: new Date().toISOString(),
    lastScanAt: new Date().toISOString(),
    hasWebhook: true,
    dbSource: "neon",
    espnErrors: 0,
    oddsRemaining: 0,
    oddsUsed: 500,
    freeBeta: false,
  });
  assert.equal(health.odds, "bad");
  assert.equal(health.oddsQuotaLevel, "exhausted");
  assert.match(health.oddsLabel, /fail-closed/i);
});

