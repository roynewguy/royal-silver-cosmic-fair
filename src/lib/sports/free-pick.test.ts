import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyFreePickTarget, isExplicitLockTier, selectFreePickOfDay, type FreePickCandidate } from "./free-pick.ts";
import { channelWebhook } from "./discord-routing.ts";

const hook = (id: string) => `https://discord.com/api/webhooks/${id}/token`;

test("DAILY_FREE_PICK_TARGETDefaults to 1 and caps at 1", () => {
  assert.equal(dailyFreePickTarget({}), 1);
  assert.equal(dailyFreePickTarget({ DAILY_FREE_PICK_TARGET: "1" }), 1);
  assert.equal(dailyFreePickTarget({ DAILY_FREE_PICK_TARGET: "0" }), 0);
  assert.equal(dailyFreePickTarget({ DAILY_FREE_PICK_TARGET: "9" }), 1);
  assert.equal(dailyFreePickTarget({ DAILY_FREE_PICK_TARGET: "nope" }), 1);
});

test("selectFreePickOfDay prefers posted LOCK over DESK", () => {
  const card: FreePickCandidate[] = [
    { id: 1, status: "posted", edgePct: 5, tier: "soft_floor" },
    { id: 2, status: "posted", edgePct: 2, tier: "lock" },
    { id: 3, status: "posted", edgePct: 4, tier: "lock" },
  ];
  assert.equal(selectFreePickOfDay(card)?.id, 3);
});

test("selectFreePickOfDay waits for LOCK still on card", () => {
  const card: FreePickCandidate[] = [
    { id: 1, status: "posted", edgePct: 5, tier: "soft_floor" },
    { id: 2, status: "queued", edgePct: 3, tier: "lock" },
  ];
  assert.equal(selectFreePickOfDay(card), null);
});

test("selectFreePickOfDay does not force DESK/soft_floor onto free channel", () => {
  const card: FreePickCandidate[] = [
    { id: 1, status: "posted", edgePct: 1.2, tier: "soft_floor" },
    { id: 2, status: "posted", edgePct: 2.5, tier: "soft_floor" },
    { id: 3, status: "queued", edgePct: 9, tier: "soft_floor" },
  ];
  assert.equal(selectFreePickOfDay(card), null);
});

test("free webhook is isolated from VIP picks and other roles", () => {
  const free = hook("free");
  const picks = hook("picks");
  const env = {
    DISCORD_PICKS_WEBHOOK: picks,
    DISCORD_FREE_PICKS_WEBHOOK: free,
    DISCORD_RESULTS_WEBHOOK: hook("results"),
    DISCORD_ALERT_WEBHOOK: hook("alerts"),
    DISCORD_TEST_WEBHOOK: hook("test"),
  };
  assert.equal(channelWebhook("free", "", env), free);
  assert.equal(channelWebhook("picks", "", env), picks);
  assert.equal(channelWebhook("free", "", { ...env, DISCORD_FREE_PICKS_WEBHOOK: picks }), "");
  assert.equal(channelWebhook("picks", "", { ...env, DISCORD_FREE_PICKS_WEBHOOK: picks }), "");
});

test("missing freeze pickTier is not a free LOCK", () => {
  assert.equal(isExplicitLockTier({ freezeJson: null } as import("./types.ts").PickRow), false);
  assert.equal(isExplicitLockTier({ freezeJson: "{}" } as import("./types.ts").PickRow), false);
  assert.equal(isExplicitLockTier({ freezeJson: JSON.stringify({ pickTier: "soft_floor" }) } as import("./types.ts").PickRow), false);
  assert.equal(isExplicitLockTier({ freezeJson: JSON.stringify({ pickTier: "lock" }) } as import("./types.ts").PickRow), true);
});
