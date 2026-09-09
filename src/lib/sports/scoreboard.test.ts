import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRecordScoreboard, editWebhookMessage } from "./discord.ts";
import { channelWebhook } from "./discord-routing.ts";

test("scoreboard preserves losing units, pending and undefined ROI", () => {
  const text = buildRecordScoreboard({ wins: 1, losses: 1, pushes: 0, units: -0.12, pending: 1, riskedUnits: 2 });
  assert.match(text, /-0.12/); assert.match(text, /-6.0%/); assert.match(text, /Pending: \*\*1/);
  assert.match(buildRecordScoreboard({ wins: 0, losses: 0, pushes: 0, units: 0, pending: 0, riskedUnits: 0 }), /ROI: \*\*—/);
});
test("scoreboard edits existing message and never POSTs a replacement on 404", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; method: string | undefined }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({url:String(url),method:init?.method}); return new Response(null,{status:404});
  }) as typeof fetch;
  try {
    assert.deepEqual(await editWebhookMessage("https://discord.com/api/webhooks/1/token?wait=true", "42", "record"), {ok:false,missing:true});
    assert.deepEqual(calls, [{url:"https://discord.com/api/webhooks/1/token/messages/42",method:"PATCH"}]);
  } finally { globalThis.fetch = original; }
});
test("scoreboard defaults to results and never inherits picks or alerts", () => {
  const hook="https://discord.com/api/webhooks/1/token";
  assert.equal(channelWebhook("record","",{DISCORD_PICKS_WEBHOOK:hook}), "");
  assert.equal(channelWebhook("record","",{DISCORD_RECORD_WEBHOOK:hook,DISCORD_ALERT_WEBHOOK:hook}), "");
  assert.equal(channelWebhook("record","",{DISCORD_RECORD_WEBHOOK:hook}), hook);
  assert.equal(channelWebhook("record","",{DISCORD_RESULTS_WEBHOOK:hook}), hook);
});

test("scoreboard can append CLV without inventing closes", () => {
  const text = buildRecordScoreboard(
    { wins: 2, losses: 1, pushes: 0, units: 0.5, pending: 0, riskedUnits: 3 },
    { sample: 3, withClose: 2, missingClose: 1, beatClose: 1, avgClv: 0.01 },
  );
  assert.match(text, /CLV \(straights · tip closes\)/);
  assert.match(text, /never invented/);
  assert.match(text, /1\/2/);
});
