import assert from "node:assert/strict";
import { test } from "node:test";
import { extraScanDateKeys, isOfficialDay, officialKey, ptDayKey, scanDateKeys, scanDateKeysForLeague } from "./day.ts";

test("official key is stable", () => {
  assert.equal(officialKey("nfl", "nfl:401772510"), "nfl:nfl:401772510:official");
});

test("today in PT is official, tomorrow is not", () => {
  const now = new Date("2026-09-04T19:00:00-07:00");
  const today = "2026-09-05T02:20:00.000Z"; // still Sep 4 PT
  const tomorrow = "2026-09-05T18:00:00-07:00";
  assert.equal(isOfficialDay(today, now), true);
  assert.equal(isOfficialDay(tomorrow, now), false);
  assert.equal(ptDayKey(now), "2026-09-04");
});

test("PT scan dates keep today's card after NY midnight", () => {
  const cases = [
    new Date("2026-09-04T20:59:00-07:00"),
    new Date("2026-09-04T21:01:00-07:00"),
    new Date("2026-09-04T23:59:00-07:00"),
  ];
  for (const now of cases) {
    const keys = scanDateKeys(now);
    assert.ok(keys.includes("20260904"), `missing today PT at ${now.toISOString()}: ${keys.join(",")}`);
    assert.equal(isOfficialDay("2026-09-05T02:00:00.000Z", now), true);
  }
  const midnight = new Date("2026-09-05T00:00:00-07:00");
  const keys = scanDateKeys(midnight);
  assert.ok(keys.includes("20260904"), "yesterday PT still fetched at midnight for grading");
  assert.ok(keys.includes("20260905"));
  assert.equal(isOfficialDay("2026-09-05T02:00:00.000Z", midnight), false);
});

test("daily leagues load tomorrow for operator picks; official card stays today", () => {
  const now = new Date("2026-09-04T19:00:00-07:00");
  assert.deepEqual(scanDateKeysForLeague(true, now).sort(), ["20260903", "20260904", "20260905"]);
  assert.deepEqual(scanDateKeysForLeague(false, now).sort(), ["20260903", "20260904", "20260905", "20260906"]);
  assert.ok(extraScanDateKeys(true, 8, now).includes("20260905"));
  assert.equal(isOfficialDay("2026-09-05T18:00:00-07:00", now), false);
});
