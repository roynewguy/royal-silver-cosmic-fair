import assert from "node:assert/strict";
import { test } from "node:test";
import { livePostingEnabled, isShadowSoak } from "../desk/production-policy.ts";
import { channelWebhook } from "./discord-routing.ts";
import { MAX_OFFICIAL_DK_CACHE_AGE_MS, MAX_OFFICIAL_DK_CACHE_AGE_MINUTES } from "./free-beta.ts";
import { MIN_CONF, MIN_EDGE } from "./models/common.ts";
import { OFFICIAL_MAX_UNCERTAINTY, OFFICIAL_MIN_QUALITY } from "./value.ts";
import {
  OFFICIAL_BOOKS,
  RESEARCH_BOOKS,
  booksCover,
  cacheSatisfiesOfficial,
  foldUsage,
  formatOddsSummary,
  isEligibleOddsGame,
  marketsCover,
  officialLockMarketAction,
  pollBand,
  pollCadenceMs,
  POLL_CADENCE_MS,
  quotaBlocksOfficialLock,
  quotaLevel,
  scanMarketsForLeague,
  shouldFetchLeagueOdds,
} from "./odds-poll.ts";

test("no-games sport does not schedule an odds fetch", () => {
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 0, hoursToKick: 1, lastFetchAgeMs: 99_000_000 }), false);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 4, hoursToKick: 1, lastFetchAgeMs: 9 * 60_000, inLookahead: false }), false);
});

test("cancelled, postponed, and completed games are not eligible for odds polling", () => {
  const startAt = new Date(Date.now() + 2 * 3600_000).toISOString();
  assert.equal(isEligibleOddsGame({ status: "cancelled", startAt, league: "mlb" }), false);
  assert.equal(isEligibleOddsGame({ status: "postponed", startAt, league: "mlb" }), false);
  assert.equal(isEligibleOddsGame({ status: "final", startAt, league: "mlb" }), false);
  assert.equal(isEligibleOddsGame({ status: "in_progress", startAt, league: "mlb" }), false);
  assert.equal(isEligibleOddsGame({ status: "scheduled", startAt, league: "mlb" }), true);
});

test("distant games poll less often than near-start games", () => {
  assert.equal(pollBand(20), "low");
  assert.equal(pollBand(8), "medium");
  assert.equal(pollBand(2), "high");
  assert.equal(pollCadenceMs(20), POLL_CADENCE_MS.low);
  assert.equal(pollCadenceMs(8), POLL_CADENCE_MS.medium);
  assert.equal(pollCadenceMs(2), POLL_CADENCE_MS.high);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 2, hoursToKick: 20, lastFetchAgeMs: 30 * 60_000 }), false);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 2, hoursToKick: 20, lastFetchAgeMs: 121 * 60_000 }), true);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 2, hoursToKick: 8, lastFetchAgeMs: 10 * 60_000 }), false);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 2, hoursToKick: 8, lastFetchAgeMs: 31 * 60_000 }), true);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 2, hoursToKick: 2, lastFetchAgeMs: 2 * 60_000 }), false);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 2, hoursToKick: 2, lastFetchAgeMs: 9 * 60_000 }), true);
});

test("games far outside the decision window are not polled", () => {
  assert.equal(pollBand(80), "none");
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 3, hoursToKick: 80, lastFetchAgeMs: 99_000_000 }), false);
  const far = new Date(Date.now() + 80 * 3600_000).toISOString();
  assert.equal(isEligibleOddsGame({ status: "scheduled", startAt: far, league: "nfl" }), false);
});

test("near-start / freeze window keeps high-frequency freshness", () => {
  assert.equal(POLL_CADENCE_MS.high, 8 * 60_000);
  assert.equal(MAX_OFFICIAL_DK_CACHE_AGE_MINUTES, 20);
  assert.equal(cacheSatisfiesOfficial(5 * 60_000, true), true);
  assert.equal(cacheSatisfiesOfficial(MAX_OFFICIAL_DK_CACHE_AGE_MS + 1, true), false);
});

test("stale cache cannot satisfy the official truth gate", () => {
  assert.equal(cacheSatisfiesOfficial(40 * 60_000, true), false);
  assert.equal(cacheSatisfiesOfficial(5 * 60_000, false), false);
  assert.equal(
    officialLockMarketAction({ remaining: 400, cacheAgeMs: 40 * 60_000, cachedIsDk: true, fetchOk: false }),
    "pass",
  );
  assert.equal(
    officialLockMarketAction({ remaining: 0, cacheAgeMs: 6 * 3600_000, cachedIsDk: true }),
    "pass",
  );
});

test("quota exhaustion prevents official LOCK when cache is stale", () => {
  assert.equal(quotaLevel(400), "ok");
  assert.equal(quotaLevel(150), "warning");
  assert.equal(quotaLevel(49), "critical");
  assert.equal(quotaLevel(0), "exhausted");
  assert.equal(quotaBlocksOfficialLock({ remaining: 0, cacheAgeMs: 40 * 60_000, cachedIsDk: true }), true);
  assert.equal(quotaBlocksOfficialLock({ remaining: 0, cacheAgeMs: 5 * 60_000, cachedIsDk: true }), false);
  assert.equal(officialLockMarketAction({ remaining: 0, cacheAgeMs: 40 * 60_000, cachedIsDk: true }), "pass");
});

test("scan markets are sport-aware and official books stay DraftKings-only", () => {
  assert.equal(scanMarketsForLeague("ufc"), "h2h");
  assert.equal(scanMarketsForLeague("mlb"), "h2h,totals");
  assert.equal(scanMarketsForLeague("nhl"), "h2h,totals");
  assert.equal(scanMarketsForLeague("nfl"), "h2h,spreads,totals");
  assert.equal(OFFICIAL_BOOKS, "draftkings");
  assert.match(RESEARCH_BOOKS, /fanduel/);
  assert.equal(marketsCover("h2h,spreads,totals", "h2h"), true);
  assert.equal(marketsCover("h2h", "spreads"), false);
  assert.equal(booksCover("draftkings,fanduel", "draftkings"), true);
  assert.equal(booksCover("draftkings", "draftkings,fanduel"), false);
});

test("telemetry folds per-request, per-tick, per-sport burn", () => {
  const t0 = Date.parse("2026-09-09T06:00:00.000Z");
  const a = foldUsage(null, { remaining: 480, used: 20, last: 3, sportKey: "baseball_mlb", now: t0 });
  const b = foldUsage(a, { remaining: 477, used: 23, last: 3, sportKey: "americanfootball_nfl", now: t0 + 1000 });
  assert.equal(a.tickUsed, 3);
  assert.equal(b.tickUsed, 6);
  assert.equal(b.dayUsed, 6);
  assert.equal(b.bySport.baseball_mlb, 3);
  assert.equal(b.bySport.americanfootball_nfl, 3);
  assert.equal(b.remaining, 477);
  assert.ok(b.estimatedDailyBurn > 0);
  assert.ok(b.estimatedMonthlyBurn > 0);
  assert.match(formatOddsSummary(b), /477 remaining/);
  assert.match(formatOddsSummary(b), /ok/);
});

test("V2 outputs and thresholds remain unchanged", () => {
  assert.equal(MIN_EDGE, 0.03);
  assert.equal(MIN_CONF, 58);
  assert.equal(OFFICIAL_MIN_QUALITY, 70);
  assert.equal(OFFICIAL_MAX_UNCERTAINTY, 0.42);
  assert.equal(MAX_OFFICIAL_DK_CACHE_AGE_MINUTES, 20);
});

test("API optimization does not change Discord or live/paper/soak gates", () => {
  assert.equal(livePostingEnabled({}), false);
  assert.equal(livePostingEnabled({ BOATBOYZ_LIVE_POSTING: "true" }), true);
  assert.equal(isShadowSoak({ SHADOW_SOAK: "true" }), true);
  assert.equal(livePostingEnabled({ BOATBOYZ_LIVE_POSTING: "true", SHADOW_SOAK: "true" }), false);
  assert.equal(
    channelWebhook("alerts", "", {
      DISCORD_PICKS_WEBHOOK: "https://discord.com/api/webhooks/1/abc",
      DISCORD_ALERT_WEBHOOK: "https://discord.com/api/webhooks/1/abc",
    }),
    "",
  );
  assert.equal(
    channelWebhook("picks", "", {
      DISCORD_PICKS_WEBHOOK: "https://discord.com/api/webhooks/1/abc",
    }),
    "https://discord.com/api/webhooks/1/abc",
  );
});

test("eligible scheduled games stay inside the lookahead window", () => {
  const card = {
    status: "scheduled" as const,
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    league: "mlb" as const,
  };
  assert.equal(isEligibleOddsGame(card), true);
  const started = { ...card, startAt: new Date(Date.now() - 60_000).toISOString() };
  assert.equal(isEligibleOddsGame(started), false);
});
