import assert from "node:assert/strict";
import { test } from "node:test";
import { soakDraftFromGame } from "./shadow-soak.ts";
import { isShadowSoak, livePostingEnabled } from "./production-policy.ts";
import { canQueueOfficial } from "../models-v3/registry.ts";
import type { GameCard, OddsSnapshot, RankPick } from "../sports/types.ts";

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

test("soak draft never marks a shadow model official", () => {
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
    capturedAt: "2026-09-09T12:00:00.000Z",
  };
  const rank: RankPick = {
    market: "moneyline",
    side: "home",
    selection: "LAD ML",
    line: null,
    price: -110,
    edgePct: 5,
    confidence: 70,
    why: "x",
    model: "v2-mlb",
    probability: 0.58,
    noVigImplied: 0.53,
    dataQuality: 88,
  };
  const game: GameCard = {
    id: "mlb:1",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: "2026-09-09T20:00:00.000Z",
    status: "scheduled",
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Giants", abbr: "SF", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    venue: null,
    odds,
    rank,
    notes: [],
    injuries: [],
    weather: null,
  };
  const draft = soakDraftFromGame(game);
  assert.ok(draft);
  assert.equal(draft.wouldHavePosted, true);
  assert.equal(canQueueOfficial(draft.modelVersion), true);
  const shadow = soakDraftFromGame({ ...game, rank: { ...rank, model: "v4-mlb-ensemble" } });
  assert.equal(canQueueOfficial(shadow?.modelVersion), false);
});
