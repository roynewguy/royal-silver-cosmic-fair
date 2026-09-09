import assert from "node:assert/strict";
import { test } from "node:test";
import { queuePostAt } from "./queue-post-at.ts";
import { unitsForTier } from "../sports/rank.ts";

test("soft_floor queue post_at is approximately now (not lead-delayed)", () => {
  const startAt = "2026-09-07T17:05:00.000Z";
  const leadMinutes = 150;
  const now = new Date("2026-09-05T02:30:00.000Z");
  const postAt = queuePostAt("soft_floor", startAt, leadMinutes, now);
  assert.equal(postAt, now.toISOString());
  const leadDelayed = new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
  assert.notEqual(postAt, leadDelayed);
});

test("lock queue post_at is now when tip−lead is still in the future", () => {
  const startAt = "2026-09-07T17:05:00.000Z";
  const leadMinutes = 150;
  const now = new Date("2026-09-05T02:30:00.000Z");
  const postAt = queuePostAt("lock", startAt, leadMinutes, now);
  assert.equal(postAt, now.toISOString());
});

test("lock queue post_at uses tip−lead when already inside the lead window", () => {
  const startAt = "2026-09-05T04:00:00.000Z";
  const leadMinutes = 150;
  const now = new Date("2026-09-05T02:30:00.000Z");
  const expected = new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
  const postAt = queuePostAt("lock", startAt, leadMinutes, now);
  assert.equal(postAt, expected);
  assert.ok(Date.parse(expected) <= now.getTime());
});

test("official queue units: LOCK 1u, soft_floor DESK 0.5u", () => {
  assert.equal(unitsForTier("lock"), 1);
  assert.equal(unitsForTier("soft_floor"), 0.5);
});

