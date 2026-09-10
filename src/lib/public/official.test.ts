import assert from "node:assert/strict";
import { test } from "node:test";
import type { PickRow } from "@/lib/sports/types";
import {
  ALLOWED_CUSTOMER_PICK_KEYS,
  EMPTY_OFFICIAL_COPY,
  assertCustomerSafe,
  buildOfficialBook,
  customerPickKeys,
  isOfficialCustomerPick,
  isResearchModelVersion,
  toCustomerPick,
} from "./official.ts";

function basePick(over: Partial<PickRow> = {}): PickRow {
  return {
    id: 1,
    gameId: "game-1",
    sport: "MLB",
    league: "mlb",
    matchup: "NYY @ BOS",
    market: "moneyline",
    selection: "BOS ML",
    side: "home",
    lockedLine: null,
    lockedOdds: -115,
    lockedOddsJson: {
      book: "DraftKings",
      details: null,
      homeMl: -115,
      awayMl: -105,
      homeSpread: null,
      awaySpread: null,
      homeSpreadOdds: null,
      awaySpreadOdds: null,
      total: null,
      overOdds: null,
      underOdds: null,
      openHomeSpread: null,
      openTotal: null,
      openHomeMl: null,
      source: "odds-api",
      capturedAt: "2026-09-09T16:00:00Z",
    },
    reason: "LOCK",
    research: "SECRET RESEARCH",
    confidence: 71,
    edgePct: 6.2,
    units: 1,
    status: "posted",
    result: null,
    profitUnits: null,
    startAt: "2026-09-09T23:10:00Z",
    postAt: "2026-09-09T20:40:00Z",
    postedAt: "2026-09-09T20:41:00Z",
    gradedAt: null,
    discordMessage: "secret discord",
    discordMessageId: "123",
    officialKey: "mlb:game-1:moneyline:BOS",
    skipReason: null,
    modelVersion: "v2-mlb",
    modelProbability: 0.58,
    modelEdge: 6.2,
    freezeJson: "{\"secret\":true}",
    selectedOdds: -115,
    postedOdds: -115,
    closingOdds: null,
    clv: null,
    createdAt: "2026-09-09T18:00:00Z",
    ledger: "official",
    pickSource: "auto",
    lineSource: "draftkings",
    postedScore: null,
    postedState: null,
    needsManualGrade: false,
    homeLogo: null,
    awayLogo: null,
    homeAbbr: "BOS",
    awayAbbr: "NYY",
    homeScore: null,
    awayScore: null,
    gameStatus: "scheduled",
    ...over,
  };
}

test("V2 official posted ticket becomes a customer pick with no internals", () => {
  const pick = toCustomerPick(basePick());
  assert.ok(pick);
  assert.deepEqual(customerPickKeys(pick), [...ALLOWED_CUSTOMER_PICK_KEYS].sort());
  assert.equal(pick.selection, "BOS ML");
  assert.equal(pick.price, -115);
  assert.equal(pick.result, null);
  assert.doesNotThrow(() => assertCustomerSafe(pick));
  const blob = JSON.stringify(pick);
  assert.equal(blob.includes("SECRET"), false);
  assert.equal(blob.includes("v2"), false);
  assert.equal(blob.includes("freeze"), false);
  assert.equal(blob.includes("discord"), false);
  assert.equal(blob.includes("paper"), false);
  assert.equal(blob.includes("shadow"), false);
  assert.equal(blob.includes("soak"), false);
  assert.equal(blob.includes("yacht"), false);
});

test("paper, soak, queued, manual, and research models never enter the customer book", () => {
  assert.equal(toCustomerPick(basePick({ ledger: "paper" })), null);
  assert.equal(toCustomerPick(basePick({ status: "queued" })), null);
  assert.equal(toCustomerPick(basePick({ status: "posting" })), null);
  assert.equal(toCustomerPick(basePick({ status: "delivery_unknown" })), null);
  assert.equal(toCustomerPick(basePick({ pickSource: "manual" })), null);
  assert.equal(toCustomerPick(basePick({ pickSource: "manual_live" })), null);
  assert.equal(toCustomerPick(basePick({ officialKey: null })), null);
  assert.equal(toCustomerPick(basePick({ modelVersion: "v3-mlb-logreg-2026-09-05" })), null);
  assert.equal(toCustomerPick(basePick({ modelVersion: "v4-mlb" })), null);
  assert.equal(toCustomerPick(basePick({ modelVersion: "model-yacht-mlb-2026.09.1" })), null);
  assert.equal(toCustomerPick(basePick({ modelVersion: "shadow-v3" })), null);
  assert.equal(toCustomerPick(basePick({ modelVersion: "soak-cert" })), null);
});

test("research version detector does not reject production V2", () => {
  assert.equal(isResearchModelVersion("v2-mlb"), false);
  assert.equal(isResearchModelVersion("v2-nfl-2026"), false);
  assert.equal(isResearchModelVersion(null), false);
  assert.equal(isResearchModelVersion("v3-nba-logreg"), true);
  assert.equal(isResearchModelVersion("model-yacht-mlb-2026.09.1"), true);
});

test("empty official book uses the safe copy and does not invent a fake record from paper", () => {
  const paper = basePick({ id: 9, ledger: "paper", officialKey: "paper-1" });
  const book = buildOfficialBook([paper]);
  assert.equal(book.empty, true);
  assert.equal(book.live.length, 0);
  assert.equal(book.history.length, 0);
  assert.equal(book.emptyCopy, EMPTY_OFFICIAL_COPY);
  assert.equal(book.record.playCount, 0);
  assert.equal(book.record.wins, 0);
});

test("graded official tickets feed public W-L-P; pending stay on the live card", () => {
  const live = basePick({ id: 1, status: "posted", result: null });
  const win = basePick({
    id: 2,
    status: "graded",
    result: "WIN",
    profitUnits: 0.87,
    gradedAt: "2026-09-08T04:00:00Z",
    clv: 0.02,
    officialKey: "mlb:game-2:moneyline:BOS",
  });
  const loss = basePick({
    id: 3,
    status: "graded",
    result: "LOSS",
    profitUnits: -1,
    gradedAt: "2026-09-07T04:00:00Z",
    clv: -0.01,
    officialKey: "mlb:game-3:moneyline:NYY",
  });
  const book = buildOfficialBook([live, win, loss, basePick({ id: 4, ledger: "paper" })]);
  assert.equal(book.empty, false);
  assert.equal(book.live.length, 1);
  assert.equal(book.history.length, 2);
  assert.equal(book.record.wins, 1);
  assert.equal(book.record.losses, 1);
  assert.equal(book.record.pending, 1);
  assert.ok(book.record.roi != null);
});

test("isOfficialCustomerPick is fail-closed on missing identity", () => {
  assert.equal(isOfficialCustomerPick({}), false);
  assert.equal(
    isOfficialCustomerPick({
      ledger: "official",
      status: "posted",
      pickSource: "auto",
      officialKey: "k",
      modelVersion: "v2-nfl",
    }),
    true,
  );
});
