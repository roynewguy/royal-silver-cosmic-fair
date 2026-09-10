import assert from "node:assert/strict";
import { test } from "node:test";
import { channelWebhook } from "../sports/discord-routing.ts";
import { livePostingEnabled, isFreshTimestamp } from "./production-policy.ts";
import { postWebhook } from "../sports/discord.ts";
import { readFile } from "node:fs/promises";

const hook = (id: string) => `https://discord.com/api/webhooks/${id}/test-token`;
test("kill switch defaults off and only explicit true permits auto delivery",()=>{
  assert.equal(livePostingEnabled({}),false);
  assert.equal(livePostingEnabled({BOATBOYZ_LIVE_POSTING:"false"}),false);
  assert.equal(livePostingEnabled({BOATBOYZ_LIVE_POSTING:"true"}),true);
  assert.equal(livePostingEnabled({BOATBOYZ_LIVE_POSTING:"true",SHADOW_SOAK:"true"}),false);
});
test("webhook responsibilities fail closed on collision; legacy is picks only",()=>{
  const env={DISCORD_WEBHOOK_URL:hook("picks")};
  assert.equal(channelWebhook("picks","",env),hook("picks"));
  for(const role of ["alerts","results","test","manual"] as const) assert.equal(channelWebhook(role,"",env),"");
  const conflict={...env,DISCORD_ALERT_WEBHOOK:hook("picks")+"?wait=true"};
  assert.equal(channelWebhook("picks","",conflict),"");
  assert.equal(channelWebhook("alerts","",conflict),"");
  assert.equal(channelWebhook("test","",{...env,DISCORD_TEST_WEBHOOK:hook("picks")}),"");
  assert.equal(channelWebhook("results","",{...env,DISCORD_RESULTS_WEBHOOK:hook("results")}),hook("results"));
});
test("missing, future and stale source timestamps are never fresh",()=>{
  const now=100000;
  for(const stamp of [null,undefined,"invalid",new Date(now+1).toISOString(),new Date(0).toISOString()]) assert.equal(isFreshTimestamp(stamp,60000,now),false);
  assert.equal(isFreshTimestamp(new Date(now-1).toISOString(),60000,now),true);
});
test("Discord transport: one attempt, uncertain 5xx/timeout/missing acknowledgement; 429 is definitive",async()=>{
  const original=globalThis.fetch;
  try {
    for(const mode of ["500","timeout","missing","429","ok"]) {
      let calls=0;
      globalThis.fetch=async(input,init)=>{
        calls++;
        assert.equal(new URL(String(input)).searchParams.get("wait"),"true");
        assert.deepEqual(JSON.parse(String(init?.body)).allowed_mentions,{parse:[]});
        if(mode==="timeout") throw new Error("timeout");
        return new Response(JSON.stringify(mode==="ok"?{id:"message"}:{}),{status:mode==="500"?500:mode==="429"?429:200});
      };
      const res=await postWebhook(hook("test"),"test only");
      assert.equal(calls,1);
      assert.equal(res.ok,mode==="ok");
      assert.equal(Boolean(res.uncertain),["500","timeout","missing"].includes(mode));
    }
  } finally {globalThis.fetch=original;}
});
test("production has a single scheduler; browser reads cannot start a worker",async()=>{
  const api=await readFile(new URL("./api.ts",import.meta.url),"utf8");
  assert.doesNotMatch(api,/setInterval|ensureWorkerStarted/);
  assert.doesNotMatch(api,/export async function tickDesk|export \{ cronAuthorized/);
  const config=JSON.parse(await readFile(new URL("../../../vercel.json",import.meta.url),"utf8"));
  assert.equal(config.crons,undefined);
  const job=await readFile(new URL("../../../.github/workflows/boatboyz-tick.yml",import.meta.url),"utf8");
  assert.match(job,/\*\/10/);
  assert.match(job,/cancel-in-progress: false/);
  assert.doesNotMatch(job,/--retry/);
});

test("free webhook fails closed on picks collision and stays isolated", ()=>{
  const env={DISCORD_PICKS_WEBHOOK:hook("picks"),DISCORD_FREE_PICKS_WEBHOOK:hook("free"),DISCORD_RESULTS_WEBHOOK:hook("results"),DISCORD_ALERT_WEBHOOK:hook("alerts")};
  assert.equal(channelWebhook("free","",env),hook("free"));
  assert.equal(channelWebhook("free","",{...env,DISCORD_FREE_PICKS_WEBHOOK:hook("picks")}),"");
  assert.equal(channelWebhook("picks","",{...env,DISCORD_FREE_PICKS_WEBHOOK:hook("picks")}),"");
});
