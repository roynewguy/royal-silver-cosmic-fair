import assert from "node:assert/strict";
import { test } from "node:test";
import { matchSingleOddsEvent } from "./odds-api.ts";
import { prePostTruthCheck, gradeTruth, startersChanged } from "./truth-gate.ts";
import { createMemoryLocker, sendOnce } from "../desk/post-pipeline.ts";
import { LLM_FORBIDDEN, SOURCE_HIERARCHY } from "./source-hierarchy.ts";
import { MLB_V2_INPUTS } from "./mlb-inputs.ts";
import type { GameCard, OddsSnapshot, RankPick } from "./types.ts";

const now = Date.parse("2026-09-04T20:00:00-07:00");

function dk(over: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    book: "DraftKings",
    details: null,
    homeMl: 135,
    awayMl: -155,
    homeSpread: null,
    awaySpread: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null,
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: 135,
    source: "odds-api",
    capturedAt: new Date(now - 60_000).toISOString(),
    ...over,
  };
}

function live(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:mia",
    espnId: "401",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(now + 3 * 3600_000).toISOString(),
    status: "scheduled",
    home: {
      name: "Miami Marlins",
      abbr: "MIA",
      logo: null,
      score: null,
      record: "70-70",
      homeSplit: null,
      roadSplit: null,
      starter: { name: "Junk", era: 4.1, whip: 1.2, savePct: null, position: "SP" },
    },
    away: {
      name: "Chicago Cubs",
      abbr: "CHC",
      logo: null,
      score: null,
      record: "80-60",
      homeSplit: null,
      roadSplit: null,
      starter: { name: "Imanaga", era: 3.2, whip: 1.1, savePct: null, position: "SP" },
    },
    venue: "loanDepot",
    odds: dk(),
    rank: null,
    notes: [],
    injuries: [],
    weather: "78 F",
    ...over,
  };
}

function rank(over: Partial<RankPick> = {}): RankPick {
  return {
    market: "moneyline",
    side: "home",
    selection: "MIA ML",
    line: null,
    price: 118,
    edgePct: 5,
    confidence: 64,
    why: "arms",
    model: "v2-mlb",
    probability: 0.48,
    noVigImplied: 0.44,
    dataQuality: 88,
    ...over,
  };
}

function queued(game: GameCard) {
  return {
    gameId: game.id,
    league: game.league,
    homeName: game.home.name,
    awayName: game.away.name,
    startAt: game.startAt,
    espnId: game.espnId,
    market: "moneyline" as const,
    homeStarter: game.home.starter?.name ?? null,
    awayStarter: game.away.starter?.name ?? null,
    freezeJson: null as string | null,
    status: "queued",
  };
}

test("fresh DK +118 is the official edge source, not the old +135 candidate", () => {
  const game = live({ odds: dk({ homeMl: 118, awayMl: -138 }) });
  const gate = prePostTruthCheck({
    queued: queued(game),
    live: game,
    rank: rank({ price: 118, edgePct: 2.1, confidence: 64 }),
    minEdge: 3,
    minConf: 58,
    now,
  });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.reason, "PASS_EDGE_DIED");
});

test("stale DK cannot post", () => {
  const game = live({ odds: dk({ capturedAt: new Date(now - 45 * 60_000).toISOString() }) });
  const gate = prePostTruthCheck({ queued: queued(game), live: game, rank: rank(), minEdge: 3, minConf: 58, now });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.reason, "PASS_DK_STALE");
});

test("ESPN odds are not official DK", () => {
  const game = live({ odds: dk({ source: "espn", book: "ESPN BET" }) });
  const gate = prePostTruthCheck({ queued: queued(game), live: game, rank: rank(), minEdge: 3, minConf: 58, now });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.reason, "PASS_DK_UNAVAILABLE");
});

test("postponed and cancelled fail closed", () => {
  const p = prePostTruthCheck({ queued: queued(live()), live: live({ status: "postponed" }), rank: rank(), minEdge: 3, minConf: 58, now });
  const c = prePostTruthCheck({ queued: queued(live()), live: live({ status: "cancelled" }), rank: rank(), minEdge: 3, minConf: 58, now });
  assert.equal(p.ok, false);
  assert.equal(c.ok, false);
  if (!p.ok) assert.equal(p.reason, "PASS_POSTPONED");
  if (!c.ok) assert.equal(c.reason, "PASS_CANCELLED");
});

test("started game cannot post", () => {
  const g = live({ startAt: new Date(now - 60_000).toISOString(), status: "in_progress" });
  const gate = prePostTruthCheck({ queued: queued(g), live: g, rank: rank(), minEdge: 3, minConf: 58, now });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.reason, "PASS_GAME_STARTED");
});

test("team mismatch and start-time conflict fail closed", () => {
  const g = live();
  const q = queued(g);
  const mismatch = prePostTruthCheck({
    queued: { ...q, homeName: "New York Yankees" },
    live: g,
    rank: rank(),
    minEdge: 3,
    minConf: 58,
    now,
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.reason, "PASS_GAME_MISMATCH");
  const moved = prePostTruthCheck({
    queued: { ...q, startAt: new Date(now + 8 * 3600_000).toISOString() },
    live: g,
    rank: rank(),
    minEdge: 3,
    minConf: 58,
    now,
  });
  assert.equal(moved.ok, false);
  if (!moved.ok) assert.equal(moved.reason, "PASS_DATA_CONFLICT");
});

test("missing MLB starters in the post window PASS", () => {
  const g = live({
    startAt: new Date(now + 60 * 60_000).toISOString(),
    home: { ...live().home, starter: null },
    away: { ...live().away, starter: null },
  });
  const gate = prePostTruthCheck({ queued: queued(g), live: g, rank: rank(), minEdge: 3, minConf: 58, now });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.reason, "PASS_MISSING_STARTER");
});

test("starter change is detected and does not reuse the old identity", () => {
  const g = live();
  assert.equal(startersChanged({ ...queued(g), homeStarter: "Alcantara" }, g), true);
  assert.equal(startersChanged(queued(g), g), false);
});

test("already posted freeze cannot send again", () => {
  const g = live();
  const gate = prePostTruthCheck({
    queued: { ...queued(g), freezeJson: "{}" },
    live: g,
    rank: rank(),
    minEdge: 3,
    minConf: 58,
    now,
  });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.reason, "PASS_ALREADY_POSTED");
});

test("successful gate freezes DK price, model version, and no LLM facts", () => {
  const g = live({ odds: dk({ homeMl: 118, awayMl: -138 }) });
  const gate = prePostTruthCheck({ queued: queued(g), live: g, rank: rank({ edgePct: 5, price: 118 }), minEdge: 3, minConf: 58, now });
  assert.equal(gate.ok, true);
  if (gate.ok) {
    assert.equal(gate.freeze.lockedOdds, 118);
    assert.equal(gate.freeze.modelVersion, "v2-mlb");
    assert.equal(gate.freeze.llmFacts, false);
    assert.ok(gate.freeze.audit?.some((a) => a.field === "price" && a.source.includes("draftkings")));
  }
});

test("ambiguous Odds API events PASS instead of guessing closest", () => {
  const match = matchSingleOddsEvent(
    { home: "Miami Marlins", away: "Chicago Cubs", startAt: "2026-09-04T23:10:00Z" },
    [
      { home_team: "Miami Marlins", away_team: "Chicago Cubs", commence_time: "2026-09-04T23:05:00Z" },
      { home_team: "Miami Marlins", away_team: "Chicago Cubs", commence_time: "2026-09-04T23:40:00Z" },
    ],
  );
  assert.equal(match.ok, false);
  if (!match.ok) assert.equal(match.reason, "PASS_ODDS_EVENT_AMBIGUOUS");
});

test("swapped home/away mapping is a mismatch, not a match", () => {
  const match = matchSingleOddsEvent(
    { home: "Miami Marlins", away: "Chicago Cubs", startAt: "2026-09-04T23:10:00Z" },
    [{ home_team: "Chicago Cubs", away_team: "Miami Marlins", commence_time: "2026-09-04T23:10:00Z" }],
  );
  assert.equal(match.ok, false);
  if (!match.ok) assert.equal(match.reason, "PASS_GAME_MISMATCH");
});

test("doubleheader still unique when commence times are distinct", () => {
  const g1 = matchSingleOddsEvent(
    { home: "Los Angeles Dodgers", away: "San Diego Padres", startAt: "2026-09-04T16:10:00Z" },
    [
      { home_team: "Los Angeles Dodgers", away_team: "San Diego Padres", commence_time: "2026-09-04T16:12:00Z" },
      { home_team: "Los Angeles Dodgers", away_team: "San Diego Padres", commence_time: "2026-09-04T23:11:00Z" },
    ],
  );
  const g2 = matchSingleOddsEvent(
    { home: "Los Angeles Dodgers", away: "San Diego Padres", startAt: "2026-09-04T23:10:00Z" },
    [
      { home_team: "Los Angeles Dodgers", away_team: "San Diego Padres", commence_time: "2026-09-04T16:12:00Z" },
      { home_team: "Los Angeles Dodgers", away_team: "San Diego Padres", commence_time: "2026-09-04T23:11:00Z" },
    ],
  );
  assert.equal(g1.ok, true);
  assert.equal(g2.ok, true);
  if (g1.ok && g2.ok) assert.notEqual(g1.index, g2.index);
});

test("grade waits when final score is missing and voids postponed posted tickets via reason", () => {
  const posted = { status: "posted", gameId: "mlb:mia", league: "mlb" };
  const missing = gradeTruth(posted, live({ status: "final", home: { ...live().home, score: null } }));
  assert.equal(missing.ok, false);
  const ok = gradeTruth(posted, live({ status: "final", home: { ...live().home, score: 4 }, away: { ...live().away, score: 2 } }));
  assert.equal(ok.ok, true);
  const pp = gradeTruth(posted, live({ status: "postponed" }));
  assert.equal(pp.ok, false);
  if (!pp.ok) assert.equal(pp.reason, "PASS_POSTPONED");
});

test("concurrent sendOnce still only completes one Discord send", async () => {
  const locker = createMemoryLocker([{ id: 9, status: "queued" }]);
  let sends = 0;
  const send = async () => {
    sends += 1;
    return { ok: true, id: `m-${sends}` };
  };
  const payload = {
    freezeJson: "{}",
    discordMessage: "x",
    selection: "MIA ML",
    market: "moneyline",
    side: "home",
    lockedOdds: 118,
    lockedLine: null,
    lockedOddsJson: "{}",
    edgePct: 4,
    confidence: 64,
    units: 1,
    modelVersion: "v2-mlb",
    modelProbability: 0.48,
    modelEdge: 4,
    postedOdds: 118,
    selectedOdds: 118,
  };
  const [a, b] = await Promise.all([sendOnce(9, locker, send, payload), sendOnce(9, locker, send, payload)]);
  assert.equal([a, b].filter((r) => r.sent).length, 1);
  assert.equal(sends, 1);
});

test("source hierarchy forbids LLM-authored odds, injuries, starters, and units", () => {
  assert.equal(SOURCE_HIERARCHY.officialPrice, "odds-api:draftkings");
  assert.ok(LLM_FORBIDDEN.includes("odds"));
  assert.ok(LLM_FORBIDDEN.includes("probability"));
  assert.ok(MLB_V2_INPUTS.productionWeightsFrozen[0].includes("0.16"));
});
