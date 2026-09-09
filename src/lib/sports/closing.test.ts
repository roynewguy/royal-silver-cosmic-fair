import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boardOpenPrice,
  closingCaptureAction,
  computeClvPoints,
  formatClvPoints,
  formatClvSummaryLine,
  formatOpenCloseLog,
  summarizeClv,
  ticketOpenPrice,
  verifiedClosingPrice,
} from "./closing.ts";
import type { OddsSnapshot } from "./types.ts";

function dkSnap(partial: Partial<OddsSnapshot> & Pick<OddsSnapshot, "homeMl" | "capturedAt">): OddsSnapshot {
  return {
    book: "DraftKings",
    details: null,
    homeMl: partial.homeMl,
    awayMl: partial.awayMl ?? 120,
    homeSpread: partial.homeSpread ?? null,
    awaySpread: partial.awaySpread ?? null,
    homeSpreadOdds: partial.homeSpreadOdds ?? null,
    awaySpreadOdds: partial.awaySpreadOdds ?? null,
    total: partial.total ?? null,
    overOdds: partial.overOdds ?? null,
    underOdds: partial.underOdds ?? null,
    openHomeSpread: partial.openHomeSpread ?? null,
    openTotal: partial.openTotal ?? null,
    openHomeMl: partial.openHomeMl ?? null,
    source: "odds-api",
    capturedAt: partial.capturedAt,
  };
}

test("verifiedClosingPrice accepts last DK quote inside 20m pregame on same line", () => {
  const start = "2026-09-09T20:00:00Z";
  const snap = dkSnap({ homeMl: -130, capturedAt: "2026-09-09T19:45:00Z", openHomeMl: -110 });
  const price = verifiedClosingPrice(JSON.stringify(snap), {
    startAt: start,
    market: "moneyline",
    side: "home",
    lockedLine: null,
  });
  assert.equal(price, -130);
});

test("verifiedClosingPrice never invents after tip, stale, or line move", () => {
  const start = "2026-09-09T20:00:00Z";
  assert.equal(
    verifiedClosingPrice(JSON.stringify(dkSnap({ homeMl: -130, capturedAt: "2026-09-09T20:01:00Z" })), {
      startAt: start,
      market: "moneyline",
      side: "home",
      lockedLine: null,
    }),
    null,
  );
  assert.equal(
    verifiedClosingPrice(JSON.stringify(dkSnap({ homeMl: -130, capturedAt: "2026-09-09T19:00:00Z" })), {
      startAt: start,
      market: "moneyline",
      side: "home",
      lockedLine: null,
    }),
    null,
  );
  assert.equal(
    verifiedClosingPrice(
      JSON.stringify(dkSnap({ homeMl: -110, homeSpread: -3.5, homeSpreadOdds: -110, capturedAt: "2026-09-09T19:50:00Z" })),
      { startAt: start, market: "spread", side: "home", lockedLine: -3 },
    ),
    null,
  );
});

test("ticket open uses posted/locked only; board open never invents away juice", () => {
  assert.equal(ticketOpenPrice({ postedOdds: -115, lockedOdds: -110 }), -115);
  assert.equal(ticketOpenPrice({ postedOdds: null, lockedOdds: -110 }), -110);
  const snap = dkSnap({ homeMl: -120, openHomeMl: -105, capturedAt: "2026-09-09T12:00:00Z" });
  assert.equal(boardOpenPrice(snap, "moneyline", "home"), -105);
  assert.equal(boardOpenPrice(snap, "moneyline", "away"), null);
});

test("CLV points and open/close log never fabricate closes", () => {
  const clv = computeClvPoints(-110, -130);
  assert.ok(clv != null && clv > 0);
  assert.match(formatClvPoints(clv), /^\+/);
  assert.match(formatOpenCloseLog({ selection: "KC ML", openPrice: -110, closePrice: null, pickTier: "lock" }), /n\/a \(no real close\)/);
  assert.match(formatOpenCloseLog({ selection: "KC ML", openPrice: -110, closePrice: -130, pickTier: "soft_floor" }), /CLV DESK/);
  assert.doesNotMatch(formatOpenCloseLog({ selection: "KC ML", openPrice: -110, closePrice: null }), /close [+-]?\d/);
});

test("summarizeClv counts real closes only", () => {
  const summary = summarizeClv([{ clv: 0.02 }, { clv: -0.01 }, { clv: null }, { clv: 0.03 }]);
  assert.equal(summary.sample, 4);
  assert.equal(summary.withClose, 3);
  assert.equal(summary.missingClose, 1);
  assert.equal(summary.beatClose, 2);
  assert.ok(summary.avgClv != null && summary.avgClv > 0);
  assert.match(formatClvSummaryLine(summary), /2\/3/);
  assert.match(formatClvSummaryLine(summarizeClv([])), /no graded straights/);
});

test("closingCaptureAction is lean under FREE_BETA and skips inventing", () => {
  assert.equal(
    closingCaptureAction({
      freeBeta: true,
      hasClosingSnapshot: false,
      cacheIsDk: false,
      cacheAgeMs: null,
      cacheBeforeStart: false,
    }),
    "skip",
  );
  assert.equal(
    closingCaptureAction({
      freeBeta: true,
      hasClosingSnapshot: false,
      cacheIsDk: true,
      cacheAgeMs: 5 * 60_000,
      cacheBeforeStart: true,
    }),
    "use-cache",
  );
  assert.equal(
    closingCaptureAction({
      freeBeta: false,
      hasClosingSnapshot: false,
      cacheIsDk: false,
      cacheAgeMs: null,
      cacheBeforeStart: false,
    }),
    "fetch",
  );
  assert.equal(
    closingCaptureAction({
      freeBeta: false,
      hasClosingSnapshot: true,
      cacheIsDk: false,
      cacheAgeMs: null,
      cacheBeforeStart: false,
    }),
    "skip",
  );
});
