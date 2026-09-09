import assert from "node:assert/strict";
import { test } from "node:test";
import { weeklyPeriod, buildWeeklyRecap } from "./weekly-recap.ts";
import { channelWebhook } from "./discord-routing.ts";
import { summarizeClv } from "./closing.ts";
import {
  OFFICIAL_EMBED_COLOR,
  buildWeeklyRecapEmbed,
  buildWeeklyRecapPayload,
} from "./discord.ts";

test("weekly recap becomes due Monday at 9 Pacific, never Sunday night", () => {
  assert.equal(weeklyPeriod(new Date("2026-09-14T15:59:59Z")).end,"2026-09-07");
  assert.deepEqual(weeklyPeriod(new Date("2026-09-14T16:00:00Z")),{start:"2026-09-07",end:"2026-09-14",publishDate:"2026-09-14"});
  assert.equal(weeklyPeriod(new Date("2026-09-15T20:00:00Z")).start,"2026-09-07");
});
test("Monday schedule follows Pacific daylight-saving changes", () => {
  assert.equal(weeklyPeriod(new Date("2026-11-02T16:59:59Z")).end,"2026-10-26");
  assert.equal(weeklyPeriod(new Date("2026-11-02T17:00:00Z")).end,"2026-11-02");
  assert.equal(weeklyPeriod(new Date("2026-03-09T16:00:00Z")).end,"2026-03-09");
});
test("recap preserves losses, voids, pending and undefined ROI", () => {
  const record={wins:0,losses:1,pushes:0,units:-1,riskedUnits:1,pending:2};
  const content=buildWeeklyRecap({start:"2026-09-07",end:"2026-09-14"},{...record,voids:1},record);
  assert.match(content,/2026-09-07 – 2026-09-13 · PT \(Pacific\)/);
  assert.match(content,/\*\*W-L-P\*\* · \*\*0-1-0\*\*/);
  assert.match(content,/-100.0%/); assert.match(content,/Pending at publication: \*\*2/);
  assert.match(content,/VOID 1/);
  assert.match(content,/America\/Los_Angeles/);
  assert.match(buildWeeklyRecap({start:"2026-09-07",end:"2026-09-14"},{...record,riskedUnits:0,voids:0},record),/ROI: \*\*—/);
});
test("recap extends with CLV summary for real closes only", () => {
  const record={wins:2,losses:1,pushes:0,units:0.8,riskedUnits:3,pending:0};
  const clv=summarizeClv([{clv:0.02},{clv:-0.01},{clv:null}]);
  const content=buildWeeklyRecap({start:"2026-09-07",end:"2026-09-14"},{...record,voids:0},record,clv);
  assert.match(content,/CLV \(straights · tip closes\)/);
  assert.match(content,/1\/2/);
  assert.match(content,/never invented/);
  assert.match(content,/\*\*1\*\* missing close/);
});
test("weekly recap gold embed matches picks/results bar and PT footer", () => {
  const record={wins:2,losses:1,pushes:0,units:0.8,riskedUnits:3,pending:0};
  const embed=buildWeeklyRecapEmbed({start:"2026-09-07",end:"2026-09-14"},{...record,voids:0},record);
  assert.equal(embed.color, OFFICIAL_EMBED_COLOR);
  assert.equal(OFFICIAL_EMBED_COLOR, 0xD4AF37);
  assert.match(embed.author?.name ?? "", /WEEKLY RECAP/);
  assert.match(embed.description ?? "", /PT \(Pacific\)/);
  assert.match(embed.description ?? "", /W-L-P/);
  assert.doesNotMatch(embed.description ?? "", /^🌊 \*\*BOATBOYZ/);
  assert.match(embed.footer?.text ?? "", /^BoatBoyzPicks · 2026-09-07–2026-09-13 PT$/);
  const payload=buildWeeklyRecapPayload({start:"2026-09-07",end:"2026-09-14"},{...record,voids:0},record);
  assert.equal(payload.content, "");
  assert.equal(payload.embeds?.length, 1);
});
test("weekly recap never falls back into official picks or operator alerts", () => {
  const h="https://discord.com/api/webhooks/1/token";
  assert.equal(channelWebhook("weekly","",{DISCORD_PICKS_WEBHOOK:h}),"");
  assert.equal(channelWebhook("weekly","",{DISCORD_WEEKLY_WEBHOOK:h,DISCORD_ALERT_WEBHOOK:h}),"");
  assert.equal(channelWebhook("weekly","",{DISCORD_WEEKLY_WEBHOOK:h}),h);
});
