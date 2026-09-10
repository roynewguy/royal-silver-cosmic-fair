import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  evaluateFinalPostGate,
  evaluateSoakCandidates,
  isShadowSoak,
  recordSoakEvaluations,
  resetSoakRecorderHealthForTests,
  soakConflictAction,
  soakKey,
  soakRecorderHealth,
  type SoakEvaluation,
} from "./shadow-soak.ts";
import { livePostingEnabled } from "./production-policy.ts";
import { canQueueOfficial } from "../models-v3/registry.ts";
import { maybePostNoPlay } from "../sports/shadow-discord.ts";
import { selectFreePickOfDay } from "../sports/free-pick.ts";
import type { GameCard, OddsSnapshot, RankPick } from "../sports/types.ts";

const now = Date.parse("2026-09-04T20:00:00-07:00");

function dk(over: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    book: "DraftKings",
    details: null,
    homeMl: 118,
    awayMl: -138,
    homeSpread: null,
    awaySpread: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null,
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: 118,
    source: "odds-api",
    capturedAt: new Date(now - 60_000).toISOString(),
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
    pickTier: "lock",
    ...over,
  };
}

function game(over: Partial<GameCard> = {}): GameCard {
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
    rank: rank(),
    notes: [],
    injuries: [],
    fetchedAt: new Date(now).toISOString(),
    injuriesFetchedAt: new Date(now).toISOString(),
    startersFetchedAt: new Date(now).toISOString(),
    weather: "78 F",
    ...over,
  };
}

function asEval(over: Partial<SoakEvaluation> & Pick<SoakEvaluation, "soakKey" | "wouldHavePosted">): SoakEvaluation {
  return {
    gameId: "mlb:mia",
    league: "mlb",
    market: "moneyline",
    selection: "MIA ML",
    side: "home",
    lockedLine: null,
    postedPrice: over.wouldHavePosted ? -110 : null,
    sportsbook: "DraftKings",
    opposingPrice: over.wouldHavePosted ? -110 : null,
    modelVersion: "v2-mlb",
    modelProbability: 0.55,
    noVigProbability: 0.5,
    edgePct: 5,
    expectedValuePct: 4,
    dataQuality: 88,
    confidence: 64,
    skipReason: over.wouldHavePosted ? null : "PASS_INJURY_UNCONFIRMED",
    freezeJson: over.wouldHavePosted ? "{\"lockedOdds\":-110}" : null,
    postedAt: over.wouldHavePosted ? "2026-09-04T20:00:00.000Z" : null,
    ...over,
  };
}

test("SHADOW_SOAK forces official Discord off even if LIVE is true", () => {
  const env = { BOATBOYZ_LIVE_POSTING: "true", SHADOW_SOAK: "true" };
  assert.equal(isShadowSoak(env), true);
  assert.equal(livePostingEnabled(env), false);
});

test("LIVE stays env-only when soak is off", () => {
  assert.equal(livePostingEnabled({ BOATBOYZ_LIVE_POSTING: "true" }), true);
  assert.equal(livePostingEnabled({}), false);
  assert.equal(livePostingEnabled({ BOATBOYZ_LIVE_POSTING: "TRUE" }), true);
});

test("candidate that passes selection but fails truth gate is not would_have_posted", () => {
  const selected = game({ injuriesFetchedAt: undefined });
  assert.ok(selected.rank);
  const ev = evaluateFinalPostGate(selected, 3, 58, now);
  assert.equal(ev.wouldHavePosted, false);
  assert.equal(ev.skipReason, "PASS_INJURY_UNCONFIRMED");
  assert.equal(ev.postedPrice, null);
  assert.equal(ev.freezeJson, null);
});

test("final truth-gate PASS reason is stored on the soak ticket", () => {
  const stale = game({ odds: dk({ capturedAt: new Date(now - 45 * 60_000).toISOString() }) });
  const ev = evaluateFinalPostGate(stale, 3, 58, now);
  assert.equal(ev.wouldHavePosted, false);
  assert.equal(ev.skipReason, "PASS_DK_STALE");
});

test("passing the real freeze gate becomes would_have_posted with frozen DK price", () => {
  const ev = evaluateFinalPostGate(game(), 3, 58, now);
  assert.equal(ev.wouldHavePosted, true);
  assert.equal(ev.skipReason, null);
  assert.equal(ev.postedPrice, 118);
  assert.ok(ev.freezeJson);
  assert.match(ev.soakKey, /:soak$/);
  assert.equal(canQueueOfficial(ev.modelVersion), true);
});

test("repeated ticks do not duplicate the same soak identity", () => {
  const g = game();
  const a = evaluateFinalPostGate(g, 3, 58, now);
  const b = evaluateFinalPostGate(g, 3, 58, now);
  assert.equal(a.soakKey, b.soakKey);
  assert.equal(soakKey({
    league: g.league,
    gameId: g.id,
    market: a.market,
    selection: a.selection,
    modelVersion: a.modelVersion,
    startAt: g.startAt,
  }), a.soakKey);
  const existing = {
    soakKey: a.soakKey,
    wouldHavePosted: true,
    postedPrice: a.postedPrice,
    freezeJson: a.freezeJson,
    skipReason: null,
  };
  assert.equal(soakConflictAction(existing, { ...a, postedPrice: 150, freezeJson: "{\"lockedOdds\":150}" }), "skip");
});

test("frozen soak posted price cannot mutate later", () => {
  const key = "2026-09-04:mlb:mlb:mia:moneyline:MIA ML:v2-mlb:soak";
  const frozen = asEval({ soakKey: key, wouldHavePosted: true, postedPrice: -110, freezeJson: "{\"lockedOdds\":-110}" });
  const moved = asEval({ soakKey: key, wouldHavePosted: true, postedPrice: -150, freezeJson: "{\"lockedOdds\":-150}" });
  assert.equal(soakConflictAction(frozen, moved), "skip");
  const fromFail = asEval({ soakKey: key, wouldHavePosted: false, postedPrice: null });
  const upgrade = asEval({ soakKey: key, wouldHavePosted: true, postedPrice: -110 });
  assert.equal(soakConflictAction(fromFail, upgrade), "upgrade");
});

test("soak DB failure is health/ops failure, not zero hypothetical bets", async () => {
  resetSoakRecorderHealthForTests();
  const prev = process.env.SHADOW_SOAK;
  process.env.SHADOW_SOAK = "true";
  const alerts: string[] = [];
  const ev = asEval({ soakKey: "day:mlb:x:moneyline:MIA ML:v2-mlb:soak", wouldHavePosted: true });
  const result = await recordSoakEvaluations([ev], {
    sql: async () => {
      throw new Error("relation soak_tickets does not exist");
    },
    alert: async (code, detail) => {
      alerts.push(`${code} ${detail}`);
    },
  });
  if (prev === undefined) delete process.env.SHADOW_SOAK;
  else process.env.SHADOW_SOAK = prev;
  assert.equal(result.ok, false);
  assert.equal(result.wouldHavePosted, null);
  assert.notEqual(result.wouldHavePosted, 0);
  assert.equal(soakRecorderHealth().ok, false);
  assert.equal(soakRecorderHealth().lastWouldHavePosted, null);
  assert.match(alerts[0] ?? "", /DATABASE_ERROR/);
  assert.match(alerts[0] ?? "", /NOT 0/);
  resetSoakRecorderHealthForTests();
});

test("empty soak slate records 0 qualified bets only when the recorder succeeds", async () => {
  resetSoakRecorderHealthForTests();
  const prev = process.env.SHADOW_SOAK;
  process.env.SHADOW_SOAK = "true";
  const result = await recordSoakEvaluations([]);
  if (prev === undefined) delete process.env.SHADOW_SOAK;
  else process.env.SHADOW_SOAK = prev;
  assert.equal(result.ok, true);
  assert.equal(result.wouldHavePosted, 0);
  assert.equal(soakRecorderHealth().ok, true);
  assert.equal(soakRecorderHealth().lastWouldHavePosted, 0);
});

test("SHADOW_SOAK still disables official/free/no-play Discord even with LIVE=true", async () => {
  const prevLive = process.env.BOATBOYZ_LIVE_POSTING;
  const prevSoak = process.env.SHADOW_SOAK;
  process.env.BOATBOYZ_LIVE_POSTING = "true";
  process.env.SHADOW_SOAK = "true";
  assert.equal(livePostingEnabled(), false);
  assert.equal(await maybePostNoPlay("https://discord.com/api/webhooks/1/aaa", "2026-09-04"), false);
  if (prevLive === undefined) delete process.env.BOATBOYZ_LIVE_POSTING;
  else process.env.BOATBOYZ_LIVE_POSTING = prevLive;
  if (prevSoak === undefined) delete process.env.SHADOW_SOAK;
  else process.env.SHADOW_SOAK = prevSoak;
});

test("V3/V4 remain incapable of soak would-post", () => {
  const v3 = evaluateFinalPostGate(game({ rank: rank({ model: "v3-mlb-logreg" }) }), 3, 58, now);
  const v4 = evaluateFinalPostGate(game({ rank: rank({ model: "v4-mlb-ensemble" }) }), 3, 58, now);
  assert.equal(v3.wouldHavePosted, false);
  assert.equal(v4.wouldHavePosted, false);
  assert.equal(canQueueOfficial("v3-mlb-logreg"), false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
});

test("0 qualifying LOCKs still means 0 official + 0 free and 0 soak would-posts", async () => {
  assert.equal(selectFreePickOfDay([]), null);
  const evals = await evaluateSoakCandidates([], 3, 58, {
    confirmDk: async (g) => ({ ok: true, game: g }),
    now,
  });
  assert.equal(evals.length, 0);
});

test("soak_key unique constraint and would-post freeze live in 0029", async () => {
  const sql = await readFile(new URL("../../../migrations/0029_soak_gate_settlement.sql", import.meta.url), "utf8");
  assert.match(sql, /soak_tickets_soak_key_uq/);
  assert.match(sql, /Soak would-post freeze is immutable/);
});
