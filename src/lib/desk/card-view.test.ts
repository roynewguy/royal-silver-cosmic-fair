import assert from "node:assert/strict";
import { test } from "node:test";
import { isLockedTicket, ticketLabel, todayOfficialCard } from "./card-view.ts";
import type { PickRow } from "../sports/types.ts";

function pick(over: Partial<PickRow>): PickRow {
  return {
    id: 1,
    gameId: "mlb:1",
    sport: "MLB",
    league: "mlb",
    matchup: "CHC @ MIA",
    market: "moneyline",
    selection: "MIA ML",
    side: "home",
    lockedLine: null,
    lockedOdds: 135,
    lockedOddsJson: {
      book: "DraftKings",
      details: null,
      homeMl: 135,
      awayMl: -163,
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
      capturedAt: null,
    },
    reason: "home",
    research: null,
    confidence: 62,
    edgePct: 4,
    units: 1,
    status: "queued",
    result: null,
    profitUnits: null,
    startAt: "2026-09-05T02:10:00.000Z",
    postAt: "2026-09-04T23:40:00.000Z",
    postedAt: null,
    gradedAt: null,
    discordMessage: null,
    discordMessageId: null,
    officialKey: "mlb:mlb:1:official",
    skipReason: null,
    modelVersion: "v2-mlb",
    modelProbability: 0.47,
    modelEdge: 4.4,
    freezeJson: null,
    selectedOdds: 135,
    postedOdds: null,
    closingOdds: null,
    clv: null,
    createdAt: "2026-09-04T20:00:00.000Z",
    homeLogo: null,
    awayLogo: null,
    homeAbbr: "MIA",
    awayAbbr: "CHC",
    homeScore: null,
    awayScore: null,
    gameStatus: "scheduled",
    ...over,
  };
}

test("queued official is provisional, posted is official, posting is verifying", () => {
  assert.equal(ticketLabel(pick({ status: "queued" })), "provisional");
  assert.equal(ticketLabel(pick({ status: "posting" })), "verifying");
  assert.equal(ticketLabel(pick({ status: "posted" })), "official");
  assert.equal(isLockedTicket(pick({ status: "queued" })), false);
  assert.equal(isLockedTicket(pick({ status: "posted" })), true);
});

test("today card ignores skipped and non-official tickets", () => {
  const now = new Date("2026-09-04T20:00:00-07:00");
  const card = todayOfficialCard(
    [
      pick({ id: 1, status: "queued" }),
      pick({ id: 2, status: "skipped", skipReason: "Rotated off daily card — stronger play ranked higher." }),
      pick({ id: 3, officialKey: null, status: "posted" }),
    ],
    now,
  );
  assert.equal(card.length, 1);
  assert.equal(card[0]?.id, 1);
});
