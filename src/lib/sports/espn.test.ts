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

test("daily leagues fetch today, yesterday, and tomorrow", () => {
  const now = new Date("2026-09-04T21:01:00-07:00");
  const nba = urlsFor(LEAGUE_BY_ID.nba, now);
  assert.equal(nba.length, 3);
  assert.equal(new Set(nba).size, 3);
  assert.ok(nba.every((u) => u.includes("dates=")));
  assert.ok(nba.some((u) => u.includes("dates=20260904")));
  assert.ok(nba.some((u) => u.includes("dates=20260903")));
  assert.ok(nba.some((u) => u.includes("dates=20260905")));
});

test("weekly leagues still prep tomorrow and +2", () => {
  const nfl = urlsFor(LEAGUE_BY_ID.nfl, new Date("2026-09-04T21:01:00-07:00"));
  assert.equal(nfl.length, 4);
  assert.ok(nfl.some((u) => u.includes("dates=20260904")));
  assert.ok(nfl.some((u) => u.includes("dates=20260905")));
  assert.ok(nfl.some((u) => u.includes("dates=20260906")));
});

test("operator board always loads tomorrow even on an empty weekly day", () => {
  const now = new Date("2026-09-04T12:00:00-07:00");
  assert.deepEqual(extraScanDateKeys(true, 8, now), ["20260903", "20260905"]);
  assert.ok(extraScanDateKeys(false, 0, now).includes("20260905"));
  assert.ok(extraScanDateKeys(false, 4, now).includes("20260906"));
});

test("normal tick scoreboard plan includes tomorrow without exploding", () => {
  const now = new Date("2026-09-04T19:00:00-07:00");
  const official = LEAGUES.filter((l) => l.official).length;
  assert.equal(official, 8);
  const count = espnScoreboardUrlCount(now);
  assert.equal(count, 27);
  assert.ok(count < 32);
  assert.equal(INJURY_CACHE_MS, 60 * 60_000);
});

test("PT midnight still grades yesterday", () => {
  const midnight = urlsFor(LEAGUE_BY_ID.mlb, new Date("2026-09-05T00:00:00-07:00"));
  assert.ok(midnight.some((u) => u.includes("dates=20260904")));
  assert.ok(midnight.some((u) => u.includes("dates=20260905")));
  assert.equal(midnight.length, 3);
});
