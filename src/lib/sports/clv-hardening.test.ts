import assert from "node:assert/strict";
import { test } from "node:test";
import { computeClvPoints, extractRealQuote, ticketClvPoints, ticketOpenPrice } from "./closing.ts";
import { impliedFromAmerican } from "./odds.ts";
import type { OddsSnapshot } from "./types.ts";

function dk(over: Partial<OddsSnapshot>): OddsSnapshot {
  return {
    book: "DraftKings",
    details: null,
    homeMl: -150,
    awayMl: 130,
    homeSpread: -1.5,
    awaySpread: 1.5,
    homeSpreadOdds: -110,
    awaySpreadOdds: -110,
    total: 8.5,
    overOdds: -110,
    underOdds: -110,
    openHomeSpread: -1.5,
    openTotal: 8.5,
    openHomeMl: -140,
    source: "odds-api",
    capturedAt: "2026-09-09T19:50:00Z",
    ...over,
  };
}

const start = "2026-09-09T20:00:00Z";

test("CLV favorite moneyline: shorter close is positive, never overwrites posted", () => {
  const posted = -150;
  const close = -170;
  const clv = computeClvPoints(posted, close);
  assert.ok(clv != null && clv > 0);
  assert.ok(Math.abs(clv - (impliedFromAmerican(close) - impliedFromAmerican(posted))) < 1e-12);
  assert.equal(ticketOpenPrice({ postedOdds: posted, lockedOdds: -140 }), posted);
});

test("CLV underdog moneyline: shorter close is positive (got a longer posted price)", () => {
  const posted = 150;
  const close = 130;
  const clv = computeClvPoints(posted, close);
  assert.ok(clv != null && clv > 0);
});

test("CLV spread and total require the locked line; missing close is null not 0", () => {
  const spread = extractRealQuote(JSON.stringify(dk({ homeSpreadOdds: -105 })), {
    startAt: start,
    market: "spread",
    side: "home",
    lockedLine: -1.5,
  });
  assert.equal(spread?.price, -105);
  const movedLine = extractRealQuote(JSON.stringify(dk({ homeSpread: -2.5, homeSpreadOdds: -110 })), {
    startAt: start,
    market: "spread",
    side: "home",
    lockedLine: -1.5,
  });
  assert.equal(movedLine, null);
  const total = extractRealQuote(JSON.stringify(dk({ overOdds: -115 })), {
    startAt: start,
    market: "total",
    side: "over",
    lockedLine: 8.5,
  });
  assert.equal(total?.price, -115);
  assert.equal(ticketClvPoints({ postedOdds: -110, lockedOdds: -110 }, null), null);
  assert.notEqual(ticketClvPoints({ postedOdds: -110, lockedOdds: -110 }, null), 0);
});

test("push and void tickets can still store CLV; missing close stays missing", () => {
  const clv = computeClvPoints(-110, -120);
  assert.ok(clv != null);
  assert.equal(computeClvPoints(-110, null), null);
  assert.equal(computeClvPoints(null, -120), null);
});

test("line movement against the bet is negative CLV", () => {
  const clv = computeClvPoints(-150, -130);
  assert.ok(clv != null && clv < 0);
});
