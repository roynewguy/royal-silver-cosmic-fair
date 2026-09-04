import assert from "node:assert/strict";
import { test } from "node:test";
import { LEAGUE_BY_ID } from "./leagues.ts";
import { urlsFor } from "./espn.ts";

test("each PT calendar date is requested once, not NY plus overlapping look-ahead", () => {
  const stamps = [
    new Date("2026-09-04T20:59:00-07:00"),
    new Date("2026-09-04T21:01:00-07:00"),
    new Date("2026-09-04T23:59:00-07:00"),
  ];
  for (const now of stamps) {
    const urls = urlsFor(LEAGUE_BY_ID.nba, now);
    assert.equal(urls.length, 3, now.toISOString());
    assert.equal(new Set(urls).size, 3);
    assert.ok(urls.every((u) => u.includes("dates=")));
    assert.ok(urls.some((u) => u.includes("dates=20260904")), urls.join("\n"));
  }
  const nfl = urlsFor(LEAGUE_BY_ID.nfl, new Date("2026-09-04T21:01:00-07:00"));
  assert.equal(nfl.length, 3);
  const midnight = urlsFor(LEAGUE_BY_ID.mlb, new Date("2026-09-05T00:00:00-07:00"));
  assert.equal(midnight.length, 3);
  assert.ok(midnight.some((u) => u.includes("dates=20260904")));
  assert.ok(midnight.some((u) => u.includes("dates=20260905")));
});
