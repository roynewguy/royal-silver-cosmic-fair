import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SOFT_FLOOR_EXPIRED_REASON,
  DISCORD_AUTH_SKIP_REASON,
  classifyDiscordHttp,
  isDiscordAuthFailure,
  isSoftFloorQueuedContext,
  parseQueuedContextJson,
  postAttemptBlockReason,
  stalePostingRecoveryStatus,
} from "./lifecycle.ts";

test("isSoftFloorQueuedContext detects softFloor flag and pickTier", () => {
  assert.equal(isSoftFloorQueuedContext(null), false);
  assert.equal(isSoftFloorQueuedContext("{}"), false);
  assert.equal(isSoftFloorQueuedContext('{"pickTier":"lock","softFloor":false}'), false);
  assert.equal(isSoftFloorQueuedContext('{"pickTier":"soft_floor"}'), true);
  assert.equal(isSoftFloorQueuedContext('{"softFloor":true}'), true);
  assert.equal(isSoftFloorQueuedContext("not-json"), false);
  assert.equal(parseQueuedContextJson('{"pickTier":"soft_floor"}')?.pickTier, "soft_floor");
});

test("postAttemptBlockReason blocks started/postponed/cancelled/delivery_unknown/duplicates", () => {
  assert.match(
    postAttemptBlockReason({ status: "delivery_unknown", gameStatus: "scheduled" }) ?? "",
    /never blind-repost/,
  );
  assert.match(
    postAttemptBlockReason({ status: "posted", gameStatus: "scheduled" }) ?? "",
    /ALREADY_POSTED/,
  );
  assert.match(
    postAttemptBlockReason({ status: "queued", gameStatus: "scheduled", freezeJson: "{}" }) ?? "",
    /freeze/,
  );
  assert.equal(
    postAttemptBlockReason({ status: "queued", gameStatus: "postponed" }),
    "PASS_POSTPONED",
  );
  assert.equal(
    postAttemptBlockReason({ status: "queued", gameStatus: "cancelled" }),
    "PASS_CANCELLED",
  );
  assert.equal(
    postAttemptBlockReason({ status: "queued", gameStatus: "in_progress" }),
    "PASS_GAME_STARTED",
  );
  assert.equal(
    postAttemptBlockReason({ status: "queued", gameStatus: "scheduled", gameStarted: true }),
    "PASS_GAME_STARTED",
  );
  assert.equal(
    postAttemptBlockReason({ status: "queued", gameStatus: "scheduled" }),
    null,
  );
});

test("Discord 401/403 are auth failures, not uncertain; 5xx is uncertain", () => {
  assert.equal(isDiscordAuthFailure(401), true);
  assert.equal(isDiscordAuthFailure(403), true);
  assert.equal(isDiscordAuthFailure(404), false);
  assert.deepEqual(classifyDiscordHttp(401), { uncertain: false, authFailure: true });
  assert.deepEqual(classifyDiscordHttp(403), { uncertain: false, authFailure: true });
  assert.deepEqual(classifyDiscordHttp(500), { uncertain: true, authFailure: false });
  assert.deepEqual(classifyDiscordHttp(429), { uncertain: false, authFailure: false });
});

test("stale posting with Discord id recovers as posted, never requeued", () => {
  assert.equal(
    stalePostingRecoveryStatus({ status: "posting", discordMessageId: "abc" }),
    "posted",
  );
  assert.equal(
    stalePostingRecoveryStatus({ status: "posting", discordMessageId: null }),
    "delivery_unknown",
  );
  assert.equal(stalePostingRecoveryStatus({ status: "queued" }), null);
});

test("soft expire / discord auth skip reasons are stable operator strings", () => {
  assert.match(SOFT_FLOOR_EXPIRED_REASON, /SOFT_FLOOR_EXPIRED/);
  assert.match(SOFT_FLOOR_EXPIRED_REASON, /never Discord/);
  assert.match(DISCORD_AUTH_SKIP_REASON, /401\/403/);
});
