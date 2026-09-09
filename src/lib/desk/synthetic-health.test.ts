import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cronAuthorized } from "./cron-auth.ts";
import { livePostingEnabled, isShadowSoak } from "./production-policy.ts";
import { channelWebhook } from "../sports/discord-routing.ts";
import { twoWayMarket } from "../sports/odds.ts";
import { evaluateBetOpportunity } from "../sports/value.ts";
import { espnScoreboardOk, oddsApiListOk } from "../sports/schema-guard.ts";
import { canQueueOfficial } from "../models-v3/registry.ts";
import { selectFreePickOfDay } from "../sports/free-pick.ts";
import { ledgerResult } from "../sports/grade.ts";
import { computeClvPoints } from "../sports/closing.ts";

test("synthetic: cron without secret cannot tick", () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(cronAuthorized(new Request("https://example.com/api/cron/tick")), false);
  if (prev !== undefined) process.env.CRON_SECRET = prev;
});

test("synthetic: odds / injury / market schema failures do not invent rows", () => {
  assert.equal(espnScoreboardOk({ nope: true }).ok, false);
  assert.equal(oddsApiListOk({ events: [] }).ok, false);
});

test("synthetic: incomplete two-way market never becomes an official BET", () => {
  const d = evaluateBetOpportunity({
    modelProbability: 0.6,
    marketProbability: 0.52,
    price: -110,
    opposingPrice: null,
    sportsbook: "DraftKings",
    capturedAt: "2026-09-09T12:00:00Z",
    dataQuality: 90,
    modelUncertainty: 0.1,
    marketAgeMs: 1000,
    sport: "mlb",
    marketType: "moneyline",
    minEdgePct: 3,
    minConfidence: 58,
    confidence: 70,
  });
  assert.equal(d.action, "PASS");
  assert.equal(d.reason, "PASS_MARKET_INCOMPLETE");
  const mkt = twoWayMarket(-110, -110);
  assert.ok(mkt.noVigA > 0 && mkt.noVigB > 0);
});

test("synthetic: Discord alerts and free stay isolated from picks", () => {
  const env = {
    DISCORD_PICKS_WEBHOOK: "https://discord.com/api/webhooks/1/aaa",
    DISCORD_ALERT_WEBHOOK: "https://discord.com/api/webhooks/1/aaa",
    DISCORD_FREE_PICKS_WEBHOOK: "https://discord.com/api/webhooks/1/aaa",
  };
  assert.equal(channelWebhook("alerts", "", env), "");
  assert.equal(channelWebhook("free", "", env), "");
});

test("synthetic: soak and paper never enable live; V3/V4 never official; 0 LOCK = 0 free", () => {
  assert.equal(isShadowSoak({ SHADOW_SOAK: "true" }), true);
  assert.equal(livePostingEnabled({ BOATBOYZ_LIVE_POSTING: "true", SHADOW_SOAK: "true" }), false);
  assert.equal(canQueueOfficial("v3-mlb-logreg"), false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
  assert.equal(selectFreePickOfDay([]), null);
});

test("synthetic: postponed/cancelled map to VOID; missing close is not 0 CLV", () => {
  assert.equal(ledgerResult("POSTPONED"), "VOID");
  assert.equal(ledgerResult("CANCELLED"), "VOID");
  assert.equal(ledgerResult("UNRESOLVED"), null);
  assert.equal(computeClvPoints(-110, null), null);
});

test("synthetic: operator APIs cannot write LIVE from the UI", async () => {
  const api = await readFile(new URL("./api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /BOATBOYZ_LIVE_POSTING\s*=/);
  assert.doesNotMatch(api, /writeDeskSettings\([^)]*livePosting/);
  assert.doesNotMatch(api, /BOATBOYZ_LIVE_POSTING:\s*['"]true['"]/);
  const sql = await readFile(new URL("../../../migrations/0028_prelive_hardening.sql", import.meta.url), "utf8");
  assert.match(sql, /soak_tickets/);
  assert.match(sql, /grade_snapshot_json/);
  assert.match(sql, /Confirmed result is immutable/);
});
