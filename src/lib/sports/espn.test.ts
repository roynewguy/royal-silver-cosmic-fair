import assert from "node:assert/strict";
import { test } from "node:test";
import { extraScanDateKeys } from "./day.ts";
import { LEAGUE_BY_ID, LEAGUES } from "./leagues.ts";
import { espnRequestHeaders, espnScoreboardUrlCount, INJURY_CACHE_MS, urlsFor } from "./espn.ts";

test("ESPN requests omit the custom user-agent rejected by the scoreboard API", () => {
  const headers = espnRequestHeaders();
  assert.equal(headers.Accept, "application/json");
  assert.equal("User-Agent" in headers, false);
});

test("daily leagues fetch today + yesterday, not a third overlapping date", () => {
  const now = new Date("2026-09-04T21:01:00-07:00");
  const nba = urlsFor(LEAGUE_BY_ID.nba, now);
  assert.equal(nba.length, 2);
  assert.equal(new Set(nba).size, 2);
  assert.ok(nba.every((u) => u.includes("dates=")));
  assert.ok(nba.some((u) => u.includes("dates=20260904")));
  assert.ok(nba.some((u) => u.includes("dates=20260903")));
  assert.ok(!nba.some((u) => u.includes("dates=20260905")));
});

test("weekly leagues still prep tomorrow", () => {
  const nfl = urlsFor(LEAGUE_BY_ID.nfl, new Date("2026-09-04T21:01:00-07:00"));
  assert.equal(nfl.length, 3);
  assert.ok(nfl.some((u) => u.includes("dates=20260904")));
  assert.ok(nfl.some((u) => u.includes("dates=20260905")));
});

test("empty weekly board skips tomorrow at runtime", () => {
  const now = new Date("2026-09-04T12:00:00-07:00");
  assert.deepEqual(extraScanDateKeys(true, 8, now), ["20260903"]);
  assert.deepEqual(extraScanDateKeys(false, 0, now), ["20260903"]);
  assert.equal(extraScanDateKeys(false, 4, now).includes("20260905"), true);
});

test("normal tick scoreboard plan is under the old 24-call fan-out", () => {
  const now = new Date("2026-09-04T19:00:00-07:00");
  const official = LEAGUES.filter((l) => l.official).length;
  assert.equal(official, 8);
  const count = espnScoreboardUrlCount(now);
  assert.equal(count, 19);
  assert.ok(count < 24);
  assert.equal(INJURY_CACHE_MS, 60 * 60_000);
});

test("PT midnight still grades yesterday", () => {
  const midnight = urlsFor(LEAGUE_BY_ID.mlb, new Date("2026-09-05T00:00:00-07:00"));
  assert.ok(midnight.some((u) => u.includes("dates=20260904")));
  assert.ok(midnight.some((u) => u.includes("dates=20260905")));
  assert.equal(midnight.length, 2);
});
