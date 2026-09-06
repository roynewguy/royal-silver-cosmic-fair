import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestOnSlate,
  clampDailyPicks,
  countsTowardDailyCap,
  dailyPickTarget,
  envDefaultDailyPicks,
  isLockedOfficialStatus,
  nextOfficialSlots,
  officialPicksForPtDay,
  planDailyCard,
  remainingDailySlots,
  rankGames,
  resolveDailyPickTarget,
  ROTATE_SKIP_REASON,
  selectSlatePicks,
  softFloorOnSlate,
} from "./rank.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -150,
  awayMl: 130,
  homeSpread: -3.5,
  awaySpread: 3.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 44.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: -3,
  openTotal: 45,
  openHomeMl: -140,
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function card(over: Partial<GameCard> = {}): GameCard {
  const start = over.startAt ?? new Date(Date.now() + 5 * 3600_000).toISOString();
  return {
    id: "nfl:1",
    espnId: "1",
    sport: "NFL",
    league: "nfl",
    startAt: start,
    status: "scheduled",
    home: { name: "Seahawks", abbr: "SEA", logo: null, score: null, record: "10-6", homeSplit: "6-2", roadSplit: "4-4", starter: null },
    away: { name: "Broncos", abbr: "DEN", logo: null, score: null, record: "8-8", homeSplit: "5-3", roadSplit: "3-5", starter: null },
    venue: null,
    odds,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

test("soccer leagues are never official picks", () => {
  const games = rankGames([
    card({
      id: "epl:1",
      league: "epl",
      sport: "EPL",
      home: { name: "Arsenal", abbr: "ARS", logo: null, score: null, record: "10-2-3", homeSplit: null, roadSplit: null, starter: null },
      away: { name: "Chelsea", abbr: "CHE", logo: null, score: null, record: "8-4-3", homeSplit: null, roadSplit: null, starter: null },
    }),
  ]);
  assert.equal(games[0]?.rank, null);

});

test("official card ignores tomorrow even if the edge is bigger", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const tonight = new Date("2026-09-04T19:00:00-07:00").toISOString();
  const tomorrow = new Date("2026-09-05T19:00:00-07:00").toISOString();
  const games = rankGames([
    card({ id: "nfl:today", startAt: tonight, home: { name: "Seahawks", abbr: "SEA", logo: null, score: null, record: "11-5", homeSplit: "7-1", roadSplit: "4-4", starter: null }, away: { name: "Rams", abbr: "LAR", logo: null, score: null, record: "9-7", homeSplit: "5-3", roadSplit: "4-4", starter: null } }),
    card({ id: "nfl:tmw", startAt: tomorrow, home: { name: "Chiefs", abbr: "KC", logo: null, score: null, record: "14-2", homeSplit: "8-0", roadSplit: "6-2", starter: null }, away: { name: "Raiders", abbr: "LV", logo: null, score: null, record: "4-12", homeSplit: "3-5", roadSplit: "1-7", starter: null } }),
  ]);
  assert.ok(bestOnSlate(games, 0, 0, now).every(g => g.id === "nfl:today"));
});

test("ESPN odds never become an official pick", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T15:20:00-07:00").toISOString();
  const games = rankGames([
    card({
      startAt: kick,
      odds: { ...odds, source: "espn", book: "ESPN" },
    }),
  ]);
  assert.equal(games[0]?.rank, null);
  assert.equal(bestOnSlate(games, 3, 58, now).length, 0);
});

test("bestOnSlate ranks the whole board, not one per sport", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T20:00:00-07:00").toISOString();
  const nbaA = card({
    id: "nba:1",
    league: "nba",
    sport: "NBA",
    startAt: kick,
    rank: { edgePct: 8, confidence: 70, market: "moneyline", side: "home", selection: "Lakers ML", line: null, price: -135, probability: 0.6, why: "home", model: "v2-nba" },
  });
  const nbaB = card({
    id: "nba:2",
    league: "nba",
    sport: "NBA",
    startAt: kick,
    rank: { edgePct: 6, confidence: 66, market: "spread", side: "home", selection: "LAL -3", line: -3, price: -110, probability: 0.58, why: "home", model: "v2-nba" },
  });
  const nhl = card({
    id: "nhl:1",
    league: "nhl",
    sport: "NHL",
    startAt: kick,
    home: { name: "Kings", abbr: "LAK", logo: null, score: null, record: "10-6", homeSplit: "6-2", roadSplit: "4-4", starter: null },
    away: { name: "Ducks", abbr: "ANA", logo: null, score: null, record: "8-8", homeSplit: "5-3", roadSplit: "3-5", starter: null },
    rank: { edgePct: 3.2, confidence: 60, market: "moneyline", side: "home", selection: "Kings ML", line: null, price: -120, probability: 0.55, why: "home ice", model: "v2-nhl" },
  });
  const ranked = bestOnSlate([nbaA, nbaB, nhl], 3, 58, now);
  assert.equal(ranked.length, 3);
  assert.deepEqual(ranked.map((g) => g.id), ["nba:1", "nba:2", "nhl:1"]);
  assert.equal(ranked.slice(0, 2).every((g) => g.sport === "NBA"), true);
});

test("bestOnSlate posts fewer than target when few qualify, and none if none qualify", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T20:00:00-07:00").toISOString();
  const one = card({
    startAt: kick,
    rank: { edgePct: 5, confidence: 62, market: "spread", side: "home", selection: "SEA -3", line: -3, price: -110, probability: 0.57, why: "home", model: "v2-nfl" },
  });
  const weak = card({
    id: "nfl:2",
    startAt: kick,
    rank: { edgePct: 1, confidence: 52, market: "spread", side: "away", selection: "DEN +3", line: 3, price: -110, probability: 0.51, why: "no", model: "v2-nfl" },
  });
  assert.equal(bestOnSlate([one, weak], 3, 58, now).length, 1);
  assert.equal(bestOnSlate([weak], 3, 58, now).length, 0);
  const started = card({
    startAt: new Date(now.getTime() - 60_000).toISOString(),
    status: "in_progress",
    rank: { edgePct: 9, confidence: 80, market: "spread", side: "home", selection: "SEA -3", line: -3, price: -110, probability: 0.7, why: "live", model: "v2-nfl" },
  });
  assert.equal(bestOnSlate([started], 3, 58, now).length, 0);
});

test("dashboard daily target wins; env is the initial default only", () => {
  assert.equal(envDefaultDailyPicks({ DAILY_PICK_TARGET: "5" }), 5);
  assert.equal(envDefaultDailyPicks({ DAILY_PICK_TARGET: "99" }), 6);
  assert.equal(envDefaultDailyPicks({}), 3);
  assert.equal(resolveDailyPickTarget({ stored: 3, source: "env", env: { DAILY_PICK_TARGET: "5" } }), 5);
  assert.equal(resolveDailyPickTarget({ stored: 2, source: "operator", env: { DAILY_PICK_TARGET: "5" } }), 2);
  assert.equal(dailyPickTarget(5, { DAILY_PICK_TARGET: "3" }), 5);
  assert.equal(dailyPickTarget(2, {}), 2);
  assert.equal(clampDailyPicks(8), 6);
  assert.equal(clampDailyPicks(0), 1);
});

test("true PT daily maximum: 3 graded today blocks a fourth", () => {
  const now = new Date("2026-09-04T19:00:00-07:00");
  const today = "2026-09-04T20:00:00-07:00";
  const committed = [
    { gameId: "nba:1", status: "graded", startAt: today },
    { gameId: "nba:2", status: "graded", startAt: today },
    { gameId: "nfl:1", status: "graded", startAt: today },
  ];
  assert.equal(officialPicksForPtDay(committed, now).length, 3);
  assert.deepEqual(nextOfficialSlots(["mlb:1"], committed, 3, now), []);
  assert.equal(remainingDailySlots(3, 3), 0);
});

test("yesterday's ungraded pick does not use today's slot", () => {
  const now = new Date("2026-09-04T19:00:00-07:00");
  const today = "2026-09-04T20:00:00-07:00";
  const yesterday = "2026-09-03T19:10:00-07:00";
  const committed = [
    { gameId: "mlb:old", status: "posted", startAt: yesterday },
    { gameId: "nba:1", status: "graded", startAt: today },
    { gameId: "pass:1", status: "skipped", startAt: today },
  ];
  assert.equal(officialPicksForPtDay(committed, now).length, 1);
  assert.equal(countsTowardDailyCap("skipped"), false);
  assert.deepEqual(nextOfficialSlots(["nba:2", "nfl:1", "nhl:1"], committed, 3, now), [
    "nba:2",
    "nfl:1",
  ]);
});

test("queued+posting+posted+graded fill the cap; skipped does not", () => {
  const now = new Date("2026-09-04T12:00:00-07:00");
  const today = "2026-09-04T18:00:00-07:00";
  const committed = [
    { gameId: "a", status: "queued", startAt: today },
    { gameId: "b", status: "posting", startAt: today },
    { gameId: "c", status: "posted", startAt: today },
    { gameId: "d", status: "graded", startAt: today },
    { gameId: "e", status: "skipped", startAt: today },
  ];
  assert.equal(officialPicksForPtDay(committed, now).length, 4);
  assert.equal(isLockedOfficialStatus("queued"), false);
  assert.equal(isLockedOfficialStatus("posting"), true);
  // Locked (posting+posted+graded) already fill target 3; queued is rotatable.
  assert.deepEqual(nextOfficialSlots(["f"], committed, 3, now), []);
  assert.deepEqual(nextOfficialSlots(["f"], committed, 6, now), ["f"]);
  const trim = planDailyCard(["f"], committed, 3, now);
  assert.deepEqual(trim.rotateOffIds, ["a"]);
  assert.equal(trim.remaining, 0);
});

test("stronger game replaces a weaker queued play", () => {
  const now = new Date("2026-09-04T12:00:00-07:00");
  const today = "2026-09-04T20:00:00-07:00";
  const queued = [
    { gameId: "nba:lakers", status: "queued", startAt: today },
    { gameId: "mlb:dodgers", status: "queued", startAt: today },
    { gameId: "mlb:yankees", status: "queued", startAt: today },
  ];
  const ranked = ["nba:celtics", "nba:lakers", "mlb:dodgers", "mlb:yankees"];
  const plan = planDailyCard(ranked, queued, 3, now);
  assert.deepEqual(plan.keepIds, ["nba:celtics", "nba:lakers", "mlb:dodgers"]);
  assert.deepEqual(plan.rotateOffIds, ["mlb:yankees"]);
  assert.equal(plan.remaining, 3);
  assert.match(ROTATE_SKIP_REASON, /stronger play ranked higher/);
});

test("target 3 to 1 trims the provisional queued card", () => {
  const now = new Date("2026-09-04T12:00:00-07:00");
  const today = "2026-09-04T20:00:00-07:00";
  const queued = [
    { gameId: "nba:lakers", status: "queued", startAt: today },
    { gameId: "mlb:dodgers", status: "queued", startAt: today },
    { gameId: "nfl:eagles", status: "queued", startAt: today },
  ];
  const ranked = ["nba:lakers", "mlb:dodgers", "nfl:eagles"];
  const plan = planDailyCard(ranked, queued, 1, now);
  assert.deepEqual(plan.keepIds, ["nba:lakers"]);
  assert.deepEqual(plan.rotateOffIds.sort(), ["mlb:dodgers", "nfl:eagles"].sort());
  assert.equal(plan.lockedCount, 0);
  assert.equal(plan.remaining, 1);
});

test("posted picks are never rotated off the card", () => {
  const now = new Date("2026-09-04T14:00:00-07:00");
  const today = "2026-09-04T20:00:00-07:00";
  const tickets = [
    { gameId: "nba:lakers", status: "posted", startAt: today },
    { gameId: "mlb:dodgers", status: "queued", startAt: today },
    { gameId: "mlb:yankees", status: "queued", startAt: today },
  ];
  const ranked = ["nba:celtics", "nba:lakers", "mlb:dodgers", "mlb:yankees"];
  const plan = planDailyCard(ranked, tickets, 3, now);
  assert.ok(!plan.keepIds.includes("nba:lakers"));
  assert.ok(!plan.rotateOffIds.includes("nba:lakers"));
  assert.deepEqual(plan.keepIds, ["nba:celtics", "mlb:dodgers"]);
  assert.deepEqual(plan.rotateOffIds, ["mlb:yankees"]);
  assert.equal(plan.lockedCount, 1);
});

test("target below already-posted count queues nothing new", () => {
  const now = new Date("2026-09-04T16:00:00-07:00");
  const today = "2026-09-04T20:00:00-07:00";
  const tickets = [
    { gameId: "nba:lakers", status: "posted", startAt: today },
    { gameId: "mlb:dodgers", status: "posted", startAt: today },
    { gameId: "nfl:eagles", status: "queued", startAt: today },
  ];
  const ranked = ["nba:celtics", "nba:lakers", "mlb:dodgers", "nfl:eagles"];
  const plan = planDailyCard(ranked, tickets, 1, now);
  assert.deepEqual(plan.keepIds, []);
  assert.deepEqual(plan.rotateOffIds, ["nfl:eagles"]);
  assert.equal(plan.remaining, 0);
  assert.equal(plan.lockedCount, 2);
});

test("soft floor fills Discord when hard edge clears nothing", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T20:00:00-07:00").toISOString();
  const weak = card({
    id: "nba:soft",
    league: "nba",
    sport: "NBA",
    startAt: kick,
    rank: {
      edgePct: 1.4,
      confidence: 54,
      market: "moneyline",
      side: "home",
      selection: "Lakers ML",
      line: null,
      price: -120,
      probability: 0.53,
      why: "thin",
      model: "v2-nba",
      passReason: "PASS_EDGE_TOO_SMALL",
    },
  });
  assert.equal(bestOnSlate([weak], 3, 58, now).length, 0);
  assert.equal(softFloorOnSlate([weak], 3, 58, now).length, 1);
  const slate = selectSlatePicks([weak], 3, 58, 3, now);
  assert.equal(slate.length, 1);
  assert.equal(slate[0]?.tier, "soft_floor");
  assert.equal(slate[0]?.game.rank?.pickTier, "soft_floor");
  assert.equal(slate[0]?.game.rank?.price, -120);
});

test("locks win the card; soft floor only engages when hard gate is empty", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T20:00:00-07:00").toISOString();
  const lock = card({
    id: "nba:lock",
    league: "nba",
    sport: "NBA",
    startAt: kick,
    rank: {
      edgePct: 5.5,
      confidence: 66,
      market: "moneyline",
      side: "home",
      selection: "Lakers ML",
      line: null,
      price: -135,
      probability: 0.6,
      why: "edge",
      model: "v2-nba",
    },
  });
  const soft = card({
    id: "nfl:soft",
    startAt: kick,
    rank: {
      edgePct: 2.1,
      confidence: 55,
      market: "spread",
      side: "home",
      selection: "SEA -3",
      line: -3,
      price: -110,
      probability: 0.54,
      why: "thin",
      model: "v2-nfl",
      passReason: "PASS_EDGE_TOO_SMALL",
    },
  });
  const withLock = selectSlatePicks([lock, soft], 3, 58, 3, now);
  assert.equal(withLock.length, 1);
  assert.equal(withLock[0]?.tier, "lock");
  assert.equal(withLock[0]?.game.id, "nba:lock");
  const softOnly = selectSlatePicks([soft], 3, 58, 3, now);
  assert.equal(softOnly.length, 1);
  assert.equal(softOnly[0]?.tier, "soft_floor");
});

test("soft floor prefers up to DAILY_PICK_TARGET best available", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T20:00:00-07:00").toISOString();
  const mk = (id: string, edge: number) =>
    card({
      id,
      league: "nba",
      sport: "NBA",
      startAt: kick,
      rank: {
        edgePct: edge,
        confidence: 50,
        market: "moneyline",
        side: "home",
        selection: `${id} ML`,
        line: null,
        price: -110,
        probability: 0.52,
        why: "soft",
        model: "v2-nba",
        passReason: "PASS_EDGE_TOO_SMALL",
      },
    });
  const slate = selectSlatePicks([mk("a", 2.5), mk("b", 1.8), mk("c", 1.2), mk("d", 0.4)], 3, 58, 3, now);
  assert.equal(slate.length, 3);
  assert.ok(slate.every((s) => s.tier === "soft_floor"));
  assert.deepEqual(slate.map((s) => s.game.id), ["a", "b", "c"]);
});

test("empty slate day still returns no soft floor", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  assert.deepEqual(selectSlatePicks([], 3, 58, 3, now), []);
});


test("soft floor activates only when hard gate is empty", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T20:00:00-07:00").toISOString();
  const weak = card({
    id: "nfl:weak",
    startAt: kick,
    rank: {
      edgePct: 1.2,
      confidence: 52,
      market: "spread",
      side: "home",
      selection: "SEA -3",
      line: -3,
      price: -110,
      probability: 0.51,
      why: "thin",
      model: "v2-nfl",
    },
  });
  const lock = card({
    id: "nfl:lock",
    startAt: kick,
    rank: {
      edgePct: 5,
      confidence: 64,
      market: "spread",
      side: "away",
      selection: "DEN +3",
      line: 3,
      price: -110,
      probability: 0.58,
      why: "lock",
      model: "v2-nfl",
    },
  });
  assert.equal(bestOnSlate([weak], 3, 58, now).length, 0);
  const softOnly = selectSlatePicks([weak], 3, 58, 3, now);
  assert.equal(softOnly.length, 1);
  assert.equal(softOnly[0]?.tier, "soft_floor");
  assert.equal(softOnly[0]?.game.rank?.pickTier, "soft_floor");

  const withLock = selectSlatePicks([weak, lock], 3, 58, 3, now);
  assert.equal(withLock.length, 1);
  assert.equal(withLock[0]?.tier, "lock");
  assert.equal(withLock[0]?.game.id, "nfl:lock");
  assert.ok(withLock.every((p) => p.tier === "lock"));
});

test("soft floor prefers up to daily target ranked by edge", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  const kick = new Date("2026-09-04T20:00:00-07:00").toISOString();
  const mk = (id: string, edge: number) =>
    card({
      id,
      startAt: kick,
      rank: {
        edgePct: edge,
        confidence: 50,
        market: "moneyline",
        side: "home",
        selection: "SEA ML",
        line: null,
        price: -120,
        probability: 0.52,
        why: "soft",
        model: "v2-nfl",
      },
    });
  const picks = selectSlatePicks([mk("a", 0.5), mk("b", 2.2), mk("c", 1.1), mk("d", 1.8)], 3, 58, 3, now);
  assert.equal(picks.length, 3);
  assert.deepEqual(picks.map((p) => p.game.id), ["b", "d", "c"]);
  assert.ok(picks.every((p) => p.tier === "soft_floor"));
});

test("empty slate stays empty even with soft floor", () => {
  const now = new Date("2026-09-04T15:00:00-07:00");
  assert.deepEqual(selectSlatePicks([], 3, 58, 3, now), []);
});
