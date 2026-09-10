import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MONTHLY_PRICE_USD,
  PLAN_ID,
  WHOP_ENFORCE,
  canAccessPicks,
  emptyMembership,
  membershipFromRow,
} from "./membership.ts";

test("pricing constant is $9.99 monthly", () => {
  assert.equal(MONTHLY_PRICE_USD, 9.99);
  assert.equal(PLAN_ID, "boatboyz-monthly");
});

test("Whop is not enforced yet and empty membership is not entitled", () => {
  assert.equal(WHOP_ENFORCE, false);
  const none = emptyMembership("user-1");
  assert.equal(none.entitled, false);
  assert.equal(none.provider, "none");
  assert.equal(canAccessPicks(none), true);
});

test("only an active Whop row is entitled", () => {
  const active = membershipFromRow("u", {
    provider: "whop",
    status: "active",
    plan_id: PLAN_ID,
    external_id: "mem_123",
    current_period_end: "2026-10-09T00:00:00Z",
  });
  assert.equal(active.entitled, true);
  assert.equal(membershipFromRow("u", { provider: "whop", status: "canceled" }).entitled, false);
  assert.equal(membershipFromRow("u", { provider: "whop", status: "past_due" }).entitled, false);
  assert.equal(membershipFromRow("u", { provider: "stripe", status: "active" }).entitled, false);
  assert.equal(membershipFromRow("u", null).entitled, false);
});
