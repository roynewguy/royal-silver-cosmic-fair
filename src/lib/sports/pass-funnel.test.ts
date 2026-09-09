import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPassFunnelLog,
  lockGatePassCode,
  summarizeSlatePass,
} from "./pass-funnel.ts";
import type { GameCard, OddsSnapshot, RankPick } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -110,
  awayMl: -110,
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
  capturedAt: "2026-09-09T20:00:00.000Z",
};

function card(over: Partial<GameCard> = {}): GameCard {
  const start = over.startAt ?? "2026-09-10T01:00:00.000Z";
  return {
    id: "nba:1",
    espnId: "1",
    sport: "NBA",
    league: "nba",
    startAt: start,
    status: "scheduled",
    home: {
      name: "Lakers",
      abbr: "LAL",
      logo: null,
      score: null,
      record: "10-10",
      homeSplit: "6-4",
      roadSplit: "4-6",
      starter: null,
    },
    away: {
      name: "Suns",
      abbr: "PHX",
      logo: null,
      score: null,
      record: "10-10",
      homeSplit: "5-5",
      roadSplit: "5-5",
      starter: null,
    },
    venue: null,
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

function rank(partial: Partial<RankPick> & Pick<RankPick, "edgePct" | "confidence">): RankPick {
  return {
    market: "moneyline",
    side: "home",
    selection: "Lakers ML",
    line: null,
    price: -110,
    why: "test",
    model: "v2-nba",
    probability: 0.55,
    passReason: null,
    ...partial,
  };
}

const now = new Date("2026-09-09T21:00:00.000Z");

test("lockGatePassCode: playable LOCK returns null", () => {
  assert.equal(lockGatePassCode(rank({ edgePct: 4.2, confidence: 62 }), 3, 58), null);
});

test("lockGatePassCode: stamped passReason wins", () => {
  assert.equal(
    lockGatePassCode(rank({ edgePct: 4, confidence: 70, passReason: "PASS_STALE_MARKET" }), 3, 58),
    "PASS_STALE_MARKET",
  );
});

test("lockGatePassCode: derives edge/conf when stamp missing", () => {
  assert.equal(lockGatePassCode(rank({ edgePct: 1.5, confidence: 70 }), 3, 58), "PASS_EDGE_TOO_SMALL");
  assert.equal(lockGatePassCode(rank({ edgePct: 4, confidence: 40 }), 3, 58), "PASS_LOW_CONFIDENCE");
  assert.equal(lockGatePassCode(null, 3, 58), "PASS_NO_RANK");
});

test("summarizeSlatePass: empty slate → PASS_EMPTY_SLATE", () => {
  const s = summarizeSlatePass([], 3, 58, now);
  assert.equal(s.scanned, 0);
  assert.equal(s.locks, 0);
  assert.equal(s.primary, "PASS_EMPTY_SLATE");
  assert.match(formatPassFunnelLog(s, 3), /SCAN→RANK→LOCK_GATE→PASS_EMPTY_SLATE/);
  assert.match(formatPassFunnelLog(s, 3), /soft_research 0 \(never queued\)/);
});

test("summarizeSlatePass: zero LOCKs aggregates edge/conf/truth codes; soft research never queued", () => {
  const games: GameCard[] = [
    card({
      id: "nba:g1",
      startAt: "2026-09-10T01:00:00.000Z",
      rank: rank({ edgePct: 1.2, confidence: 70, passReason: "PASS_EDGE_TOO_SMALL" }),
    }),
    card({
      id: "nba:g2",
      startAt: "2026-09-10T02:00:00.000Z",
      rank: rank({ edgePct: 2.0, confidence: 65, passReason: "PASS_EDGE_TOO_SMALL" }),
    }),
    card({
      id: "nba:g3",
      startAt: "2026-09-10T03:00:00.000Z",
      rank: rank({ edgePct: 4.0, confidence: 40, passReason: "PASS_LOW_CONFIDENCE" }),
    }),
    card({
      id: "nba:g4",
      startAt: "2026-09-10T04:00:00.000Z",
      rank: rank({ edgePct: 3.5, confidence: 60, passReason: "PASS_LOW_DATA_QUALITY", dataQuality: 40 }),
    }),
    card({
      id: "nba:g5",
      startAt: "2026-09-10T05:00:00.000Z",
      rank: null,
    }),
  ];
  const s = summarizeSlatePass(games, 3, 58, now);
  assert.equal(s.locks, 0);
  assert.equal(s.scanned, 5);
  assert.equal(s.primary, "PASS_EDGE_TOO_SMALL");
  assert.ok(s.softResearch >= 3, "priced soft-eligible tickets count as research");
  const by = Object.fromEntries(s.reasons.map((r) => [r.code, r.count]));
  assert.equal(by.PASS_EDGE_TOO_SMALL, 2);
  assert.equal(by.PASS_LOW_CONFIDENCE, 1);
  assert.equal(by.PASS_LOW_DATA_QUALITY, 1);
  assert.equal(by.PASS_NO_RANK, 1);
  const log = formatPassFunnelLog(s, 3);
  assert.match(log, /SCAN→RANK→LOCK_GATE→PASS_EDGE_TOO_SMALL/);
  assert.match(log, /locks 0/);
  assert.match(log, /never queued/);
  assert.match(log, /PASS_EDGE_TOO_SMALL×2/);
  assert.doesNotMatch(log, /zombie/i);
});

test("summarizeSlatePass: LOCK present → locks counted; soft still research-only tally", () => {
  const games: GameCard[] = [
    card({
      id: "nba:lock1",
      startAt: "2026-09-10T01:00:00.000Z",
      rank: rank({ edgePct: 5, confidence: 70, passReason: null }),
    }),
    card({
      id: "nba:soft1",
      startAt: "2026-09-10T02:00:00.000Z",
      rank: rank({ edgePct: 1.5, confidence: 60, passReason: "PASS_EDGE_TOO_SMALL" }),
    }),
  ];
  const s = summarizeSlatePass(games, 3, 58, now);
  assert.equal(s.locks, 1);
  assert.equal(s.softResearch, 1);
  assert.equal(s.reasons.find((r) => r.code === "PASS_EDGE_TOO_SMALL")?.count, 1);
});
