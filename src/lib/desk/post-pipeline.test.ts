import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryLocker, sendOnce, type CompletePayload } from "./post-pipeline.ts";

function payload(): Omit<CompletePayload, "discordMessageId"> {
  return {
    freezeJson: "{\"modelVersion\":\"v2-nfl\"}",
    discordMessage: "SEA -3",
    selection: "SEA -3",
    market: "spread",
    side: "home",
    lockedOdds: -110,
    lockedLine: -3,
    lockedOddsJson: "{}",
    edgePct: 4,
    confidence: 62,
    units: 1,
    modelVersion: "v2-nfl",
    modelProbability: 0.62,
    modelEdge: 4,
    postedOdds: -110,
    selectedOdds: -110,
  };
}

test("two simultaneous posts send Discord once", async () => {
  const locker = createMemoryLocker([{ id: 7, status: "queued" }]);
  let sends = 0;
  const send = async () => {
    sends += 1;
    await new Promise((r) => setTimeout(r, 15));
    return { ok: true, id: `msg-${sends}` };
  };
  const body = payload();
  const [a, b] = await Promise.all([
    sendOnce(7, locker, send, body),
    sendOnce(7, locker, send, body),
  ]);
  const posted = [a, b].filter((r) => r.sent);
  const blocked = [a, b].filter((r) => !r.claimed);
  assert.equal(posted.length, 1);
  assert.equal(blocked.length, 1);
  assert.equal(sends, 1);
  assert.equal(locker.rows.get(7)?.status, "posted");
  assert.equal(locker.rows.get(7)?.freezeJson, body.freezeJson);
  assert.equal(locker.rows.get(7)?.discordId, "msg-1");
});

test("worker and manual Post Now share the claim so only one send happens", async () => {
  const locker = createMemoryLocker([{ id: 3, status: "queued" }]);
  let sends = 0;
  const send = async () => {
    sends += 1;
    return { ok: true, id: "one" };
  };
  const worker = sendOnce(3, locker, send, payload());
  const manual = sendOnce(3, locker, send, payload());
  const results = await Promise.all([worker, manual]);
  assert.equal(results.filter((r) => r.sent).length, 1);
  assert.equal(results.filter((r) => r.claimed).length, 1);
  assert.equal(sends, 1);
  assert.equal(locker.rows.get(3)?.status, "posted");
});

test("Discord failure returns posting to queued and allows retry", async () => {
  const locker = createMemoryLocker([{ id: 9, status: "queued" }]);
  const fail = await sendOnce(9, locker, async () => ({ ok: false, error: "429" }), payload());
  assert.equal(fail.sent, false);
  assert.equal(fail.claimed, true);
  assert.equal(fail.status, "queued");
  assert.equal(locker.rows.get(9)?.freezeJson, null);
  assert.equal(locker.rows.get(9)?.status, "queued");

  const ok = await sendOnce(9, locker, async () => ({ ok: true, id: "retry" }), payload());
  assert.equal(ok.sent, true);
  assert.equal(locker.rows.get(9)?.status, "posted");
  assert.equal(locker.rows.get(9)?.discordId, "retry");
});

test("already posting or posted never sends", async () => {
  const locker = createMemoryLocker([
    { id: 1, status: "posting" },
    { id: 2, status: "posted", freezeJson: "{}" },
  ]);
  let sends = 0;
  const send = async () => {
    sends += 1;
    return { ok: true, id: "x" };
  };
  const a = await sendOnce(1, locker, send, payload());
  const b = await sendOnce(2, locker, send, payload());
  assert.equal(a.claimed, false);
  assert.equal(b.claimed, false);
  assert.equal(sends, 0);
});
