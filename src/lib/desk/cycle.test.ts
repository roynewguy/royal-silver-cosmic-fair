import assert from "node:assert/strict";
import { test } from "node:test";
import { queuePostAt } from "./queue-post-at.ts";

test("soft_floor queue post_at is approximately now (not lead-delayed)", () => {
  const startAt = "2026-09-07T17:05:00.000Z"; // Sunday afternoon first pitch
  const leadMinutes = 150;
  const now = new Date("2026-09-05T02:30:00.000Z"); // Saturday night tick
  const postAt = queuePostAt("soft_floor", startAt, leadMinutes, now);
  assert.equal(postAt, now.toISOString());
  const leadDelayed = new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
  assert.notEqual(postAt, leadDelayed);
  assert.ok(new Date(postAt).getTime() <= now.getTime() + 1000);
  assert.ok(new Date(postAt).getTime() >= now.getTime() - 1000);
});

test("lock queue post_at uses postLeadMinutes before start", () => {
  const startAt = "2026-09-07T17:05:00.000Z";
  const leadMinutes = 150;
  const now = new Date("2026-09-05T02:30:00.000Z");
  const postAt = queuePostAt("lock", startAt, leadMinutes, now);
  assert.equal(postAt, new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString());
  assert.notEqual(postAt, now.toISOString());
});
