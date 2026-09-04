import assert from "node:assert/strict";
import { test } from "node:test";
import { isOfficialDay, officialKey, ptDayKey } from "./day.ts";

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
