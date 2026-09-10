import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNoPlayEmbed,
  buildNoPlayMessage,
  buildOfficialPickEmbed,
  buildOfficialPickPayload,
  buildOfficialResultEmbed,
  buildOwnerAlertPayload,
  customerPickLine,
  frozenOfficialCard,
  postedClockPt,
  postWebhook,
  resultBadgePlain,
  ticketId,
} from "./discord.ts";
import { channelWebhook, resolveTestWebhook, webhooksIsolated } from "./discord-routing.ts";
import { canQueueOfficial } from "../models-v3/registry.ts";
import { MODEL_YACHT_MLB_CONTRACT } from "../model-yacht/names.ts";
import { yachtCanPostFreeDiscord, yachtCanPostOfficialDiscord } from "../model-yacht/safety.ts";
import { livePostingEnabled } from "../desk/production-policy.ts";
import { sendOnce, createMemoryLocker, type CompletePayload } from "../desk/post-pipeline.ts";
import { selectFreePickOfDay } from "./free-pick.ts";
import { noPlayEnabled } from "./shadow-discord.ts";
import { sportsbookSettlement } from "./grade.ts";
import { evaluatePreflightVerdict } from "../desk/preflight-verdict.ts";
import { resultDeliveryAlertCode } from "../desk/alerts.ts";
import { shouldQueueOfficialResultPost } from "../desk/lifecycle.ts";
import type { DeskRecord, GameCard, PickRow } from "./types.ts";

const hook = (id: string) => `https://discord.com/api/webhooks/${id}/token`;

function lockPick(over: Partial<PickRow> = {}): PickRow {
  return {
    id: 20,
    sport: "MLB",
    selection: "Dodgers ML",
    matchup: "SD @ LAD",
    market: "moneyline",
    side: "home",
    lockedOdds: -125,
    lockedLine: null,
    units: 1,
    confidence: 70,
    modelProbability: 0.62,
    modelEdge: 4.1,
    edgePct: 4.1,
    modelVersion: "v2-mlb",
    reason: "PASS_OK internals must never leak",
    startAt: new Date("2026-09-10T02:10:00Z").toISOString(),
    postedAt: "2026-09-09T23:32:00Z",
    lockedOddsJson: { book: "DraftKings", source: "odds-api" },
    freezeJson: JSON.stringify({ pickTier: "lock", softFloor: false }),
    officialKey: "mlb:401:official",
    ...over,
  } as PickRow;
}

function game(): GameCard {
  return {
    status: "scheduled",
    sport: "MLB",
    league: "mlb",
    away: { name: "Padres", abbr: "SD", score: null },
    home: { name: "Dodgers", abbr: "LAD", score: null },
  } as GameCard;
}

function payload(): Omit<CompletePayload, "discordMessageId"> {
  return {
    freezeJson: "{\"pickTier\":\"lock\"}",
    discordMessage: "Dodgers ML",
    selection: "Dodgers ML",
    market: "moneyline",
    side: "home",
    lockedOdds: -125,
    lockedLine: null,
    lockedOddsJson: "{}",
    edgePct: 4,
    confidence: 70,
    units: 1,
    modelVersion: "v2-mlb",
    modelProbability: 0.62,
    modelEdge: 4,
    postedOdds: -125,
    selectedOdds: -125,
  };
}

test("official ticket cannot post twice", async () => {
  const locker = createMemoryLocker([{ id: 20, status: "queued" }]);
  let sends = 0;
  const send = async () => {
    sends += 1;
    return { ok: true, id: `msg-${sends}` };
  };
  const a = await sendOnce(20, locker, send, payload());
  const b = await sendOnce(20, locker, send, payload());
  assert.equal(a.sent, true);
  assert.equal(b.claimed, false);
  assert.equal(sends, 1);
});

test("shadow/soak ticket cannot post publicly even if LIVE=true", () => {
  assert.equal(
    livePostingEnabled({ BOATBOYZ_LIVE_POSTING: "true", SHADOW_SOAK: "true" }),
    false,
  );
  assert.equal(livePostingEnabled({ BOATBOYZ_LIVE_POSTING: "true" }), true);
});

test("V3/V4 cannot post official", () => {
  assert.equal(canQueueOfficial("v2-mlb"), true);
  assert.equal(canQueueOfficial("v3-mlb-logreg"), false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
});

test("Model Yacht cannot post official or free Discord", () => {
  assert.equal(canQueueOfficial(MODEL_YACHT_MLB_CONTRACT), false);
  assert.equal(yachtCanPostOfficialDiscord(MODEL_YACHT_MLB_CONTRACT, { BOATBOYZ_LIVE_POSTING: "true" }), false);
  assert.equal(yachtCanPostFreeDiscord(MODEL_YACHT_MLB_CONTRACT), false);
});

test("free pick requires an official LOCK", () => {
  assert.equal(selectFreePickOfDay([]), null);
  assert.equal(selectFreePickOfDay([{ id: 1, status: "posted", edgePct: 9, tier: "soft_floor" }]), null);
  assert.equal(selectFreePickOfDay([{ id: 2, status: "queued", edgePct: 9, tier: "lock" }]), null);
  assert.equal(selectFreePickOfDay([{ id: 3, status: "posted", edgePct: 4, tier: "lock" }])?.id, 3);
});

test("Discord timeout does not blindly resend", async () => {
  const locker = createMemoryLocker([{ id: 8, status: "queued" }]);
  const first = await sendOnce(8, locker, async () => {
    throw new Error("timeout");
  }, payload());
  assert.equal(first.uncertain, true);
  assert.equal(first.status, "delivery_unknown");
  let sends = 0;
  const again = await sendOnce(8, locker, async () => {
    sends += 1;
    return { ok: true, id: "dup" };
  }, payload());
  assert.equal(again.claimed, false);
  assert.equal(sends, 0);
});

test("results preserve original frozen odds", () => {
  const pick = lockPick({ lockedOdds: -125, postedOdds: -125, selectedOdds: -140 } as Partial<PickRow>);
  const final = {
    ...game(),
    status: "final",
    home: { name: "Dodgers", abbr: "LAD", score: 5 },
    away: { name: "Padres", abbr: "SD", score: 1 },
  } as GameCard;
  const record: DeskRecord = { wins: 1, losses: 0, pushes: 0, units: 0.8, riskedUnits: 1, pending: 0 };
  const embed = buildOfficialResultEmbed(pick, final, "WIN", 0.8, record);
  const blob = JSON.stringify(embed);
  assert.match(blob, /-125/);
  assert.doesNotMatch(blob, /-140/);
  assert.equal(embed.fields?.find((f) => f.name === "Frozen odds")?.value, "-125");
  assert.equal(customerPickLine(pick), "Dodgers ML -125");
});

test("postponed is not incorrectly graded as a public result", () => {
  const rule = sportsbookSettlement("postponed");
  assert.equal(rule.ledgerResult, null);
  assert.equal(rule.publicRecord, false);
  assert.equal(rule.status, "PENDING_SETTLEMENT");
  assert.equal(sportsbookSettlement("cancelled").ledgerResult, "VOID");
  assert.equal(resultBadgePlain("VOID"), "⚪ VOID");
  assert.equal(resultBadgePlain("PUSH"), "➖ PUSH");
});

test("alerts cannot route to official picks webhook", () => {
  const env = {
    DISCORD_PICKS_WEBHOOK: hook("picks"),
    DISCORD_RESULTS_WEBHOOK: hook("results"),
    DISCORD_ALERT_WEBHOOK: hook("picks"),
  };
  assert.equal(channelWebhook("alerts", "", env), "");
  assert.equal(channelWebhook("picks", "", env), "");
  const isolated = {
    DISCORD_PICKS_WEBHOOK: hook("picks"),
    DISCORD_RESULTS_WEBHOOK: hook("results"),
    DISCORD_ALERT_WEBHOOK: hook("alerts"),
  };
  assert.equal(webhooksIsolated(isolated), true);
  assert.equal(channelWebhook("alerts", "", isolated), hook("alerts"));
  const payload = buildOwnerAlertPayload("DISCORD_401", "webhook unauthorized");
  assert.match(payload.content ?? "", /CRITICAL DISCORD_401/);
  assert.match(payload.embeds?.[0]?.footer?.text ?? "", /not a customer pick/i);
});

test("model lab webhook cannot equal official picks", () => {
  const env = {
    DISCORD_PICKS_WEBHOOK: hook("picks"),
    DISCORD_RESULTS_WEBHOOK: hook("results"),
    DISCORD_ALERT_WEBHOOK: hook("alerts"),
    DISCORD_MODEL_LAB_WEBHOOK: hook("picks"),
  };
  assert.equal(channelWebhook("lab", "", env), "");
  assert.equal(channelWebhook("picks", "", env), "");
});

test("0 qualifying picks creates no fake LOCK", () => {
  assert.equal(selectFreePickOfDay([]), null);
  assert.equal(noPlayEnabled({}), false);
  const msg = buildNoPlayMessage();
  assert.match(msg, /NO QUALIFYING PLAYS TODAY/);
  assert.doesNotMatch(msg, /LOCK/);
  assert.doesNotMatch(msg, /PASS_/);
  const embed = buildNoPlayEmbed();
  assert.match(embed.description ?? "", /NO QUALIFYING PLAYS TODAY/);
  assert.doesNotMatch(embed.description ?? "", /PASS_/);
  assert.doesNotMatch(JSON.stringify(embed), /\bLOCK\b/);
  assert.doesNotMatch(JSON.stringify(embed), /BB-\d+/);
});

test("customer LOCK embed makes the bet obvious and hides internals", () => {
  const embed = buildOfficialPickEmbed(lockPick(), game());
  const payload = buildOfficialPickPayload(lockPick(), game());
  assert.equal(ticketId(lockPick()), "BB-20");
  assert.match(embed.author?.name ?? "", /🚨 BOATBOYZ LOCK/);
  assert.match(embed.description ?? "", /\*\*PICK\*\*/);
  assert.match(embed.description ?? "", /Dodgers ML -125/);
  assert.match(embed.description ?? "", /Padres vs Dodgers/);
  assert.match(embed.description ?? "", /Ticket: BB-20/);
  assert.match(embed.description ?? "", /Posted: .+ PT/);
  assert.doesNotMatch(JSON.stringify(embed), /PASS_|no-vig|No-Vig|confidence\/100|WHY BoatBoyz/i);
  assert.equal(payload.embeds?.length, 1);
});

test("TEST webhook resolver refuses official collision", () => {
  assert.equal(
    resolveTestWebhook({
      DISCORD_TEST_WEBHOOK: hook("picks"),
      DISCORD_PICKS_WEBHOOK: hook("picks"),
    }).url,
    "",
  );
  const ok = resolveTestWebhook({
    DISCORD_TEST_WEBHOOK: hook("test"),
    DISCORD_PICKS_WEBHOOK: hook("picks"),
    DISCORD_RESULTS_WEBHOOK: hook("results"),
    DISCORD_ALERT_WEBHOOK: hook("alerts"),
  });
  assert.equal(ok.url, hook("test"));
});

test("preflight GREEN requires isolation and zero delivery_unknown; live OFF is not RED", () => {
  const ready: { name: string; status: "READY" | "BLOCKED" }[] = [
    "Database",
    "Automation",
    "ESPN",
    "Odds API",
    "Discord picks",
    "Discord results",
    "Discord alerts",
    "Webhook isolation",
  ].map((name) => ({ name, status: "READY" as const }));
  ready.push({ name: "New automated customer picks", status: "BLOCKED" });
  const green = evaluatePreflightVerdict({ checks: ready, deliveryUnknown: 0 });
  assert.equal(green.verdict, "GREEN");
  const redUnknown = evaluatePreflightVerdict({ checks: ready, deliveryUnknown: 1 });
  assert.equal(redUnknown.verdict, "RED");
  assert.match(redUnknown.reason, /delivery_unknown/);
  const redPicks = evaluatePreflightVerdict({
    checks: ready.map((c) => c.name === "Discord picks" ? { ...c, status: "BLOCKED" as const } : c),
    deliveryUnknown: 0,
  });
  assert.equal(redPicks.verdict, "RED");
});

test("postWebhook 429 retries once then fails closed, not uncertain", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("rate", { status: 429, headers: { "retry-after": "0" } });
  }) as typeof fetch;
  try {
    const res = await postWebhook(hook("test"), "hello");
    assert.equal(res.ok, false);
    assert.equal(Boolean(res.uncertain), false);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("frozen Discord card ignores later market quotes and mutated pick-row odds", () => {
  const posted = "2026-09-09T23:32:00.000Z";
  const pick = lockPick({
    selection: "Padres ML",
    lockedOdds: -200,
    lockedLine: 1.5,
    postedAt: null,
    lockedOddsJson: { book: "FanDuel", source: "odds-api" } as PickRow["lockedOddsJson"],
    freezeJson: JSON.stringify({
      pickTier: "lock",
      selection: "Dodgers ML",
      market: "moneyline",
      side: "home",
      lockedOdds: -125,
      lockedLine: null,
      sportsbook: "DraftKings",
      postedTimestamp: posted,
      frozenAt: posted,
    }),
  });
  const later = {
    ...game(),
    odds: { book: "FanDuel", source: "live", homeMl: -200, awayMl: 170, capturedAt: new Date().toISOString() },
  } as unknown as GameCard;
  const card = frozenOfficialCard(pick);
  assert.equal(card.selection, "Dodgers ML");
  assert.equal(card.lockedOdds, -125);
  assert.equal(card.lockedLine, null);
  assert.equal(card.sportsbook, "DraftKings");
  assert.equal(card.postedAt, posted);
  const embed = buildOfficialPickEmbed(pick, later);
  const blob = JSON.stringify(embed);
  assert.match(blob, /Dodgers ML -125/);
  assert.match(blob, /Sportsbook: DraftKings/);
  assert.doesNotMatch(blob, /FanDuel/);
  assert.doesNotMatch(blob, /-200/);
  assert.doesNotMatch(blob, /Padres ML/);
  const result = buildOfficialResultEmbed(pick, {
    ...later,
    status: "final",
    home: { name: "Dodgers", abbr: "LAD", score: 4 },
    away: { name: "Padres", abbr: "SD", score: 1 },
  } as GameCard, "WIN", 0.8, { wins: 1, losses: 0, pushes: 0, units: 0.8, riskedUnits: 1, pending: 0 });
  assert.equal(result.fields?.find((f) => f.name === "Frozen odds")?.value, "-125");
  assert.doesNotMatch(JSON.stringify(result), /-200/);
});

test("missing posted timestamp is not invented from now", () => {
  assert.equal(postedClockPt(null), "—");
  assert.equal(postedClockPt(undefined), "—");
  assert.equal(postedClockPt("not-a-date"), "—");
  const pick = lockPick({
    postedAt: null,
    freezeJson: JSON.stringify({ pickTier: "lock", selection: "Dodgers ML", lockedOdds: -125 }),
  });
  const embed = buildOfficialPickEmbed(pick, game());
  assert.match(embed.description ?? "", /Posted: —/);
  assert.doesNotMatch(embed.description ?? "", /Posted: \d/);
});

test("webhook collision fail-closes official, results, alerts, free, and test", () => {
  const env = {
    DISCORD_PICKS_WEBHOOK: hook("picks"),
    DISCORD_RESULTS_WEBHOOK: hook("results"),
    DISCORD_ALERT_WEBHOOK: hook("alerts"),
    DISCORD_FREE_PICKS_WEBHOOK: hook("free"),
    DISCORD_TEST_WEBHOOK: hook("test"),
  };
  assert.equal(channelWebhook("picks", "", env), hook("picks"));
  assert.equal(channelWebhook("results", "", env), hook("results"));
  assert.equal(channelWebhook("alerts", "", env), hook("alerts"));
  assert.equal(channelWebhook("free", "", env), hook("free"));
  assert.equal(channelWebhook("test", "", env), hook("test"));
  assert.equal(channelWebhook("test", "", { ...env, DISCORD_TEST_WEBHOOK: hook("results") }), "");
  assert.equal(channelWebhook("results", "", { ...env, DISCORD_TEST_WEBHOOK: hook("results") }), "");
  assert.equal(channelWebhook("free", "", { ...env, DISCORD_FREE_PICKS_WEBHOOK: hook("picks") }), "");
  assert.equal(channelWebhook("picks", "", { ...env, DISCORD_FREE_PICKS_WEBHOOK: hook("picks") }), "");
  assert.equal(webhooksIsolated(env), true);
});

test("uncertain result delivery alerts DISCORD_DELIVERY_UNKNOWN and does not retry", () => {
  assert.equal(resultDeliveryAlertCode({ uncertain: true }), "DISCORD_DELIVERY_UNKNOWN");
  assert.equal(resultDeliveryAlertCode({ uncertain: false }), "DISCORD_FAIL");
  assert.equal(resultDeliveryAlertCode({}), "DISCORD_FAIL");
});

test("POSTPONED does not become a public result post; cancelled VOID does", () => {
  assert.equal(shouldQueueOfficialResultPost({ ledger: "official", result: null, gameStatus: "postponed" }), false);
  assert.equal(shouldQueueOfficialResultPost({ ledger: "official", result: "VOID", gameStatus: "cancelled" }), true);
  const postponed = sportsbookSettlement("postponed");
  assert.equal(postponed.publicRecord, false);
  assert.equal(postponed.ledgerResult, null);
});
