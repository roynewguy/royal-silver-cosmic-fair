import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  allChampions,
  championFor,
  championHistory,
  isActiveChampion,
  isVerifiedModel,
  previousChampion,
  productionRankerFor,
  promoteSportChampion,
  registerProductionRanker,
  resetChampionStore,
  rollbackSportChampion,
  sportOfVersion,
  verifyChallenger,
} from "./champions.ts";
import { canQueueOfficial, PRODUCTION_MODELS } from "./registry.ts";
import { promoteChallenger } from "./promotion.ts";
import { rankGame } from "../sports/rank.ts";
import { qualifyOfficial } from "../sports/policy.ts";
import { prePostTruthCheck } from "../sports/truth-gate.ts";
import type { GameCard, OddsSnapshot, RankPick } from "../sports/types.ts";

afterEach(() => {
  resetChampionStore();
});

const dk: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -130,
  awayMl: 110,
  homeSpread: -3,
  awaySpread: 3,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 44.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: -3,
  openTotal: 45,
  openHomeMl: -125,
  source: "odds-api",
  capturedAt: new Date().toISOString(),
};

function game(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "nfl:1",
    espnId: "1",
    sport: "NFL",
    league: "nfl",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    status: "scheduled",
    home: {
      name: "Seahawks",
      abbr: "SEA",
      logo: null,
      score: null,
      record: "10-6",
      homeSplit: "7-1",
      roadSplit: "3-5",
      starter: null,
    },
    away: {
      name: "Broncos",
      abbr: "DEN",
      logo: null,
      score: null,
      record: "8-8",
      homeSplit: "5-3",
      roadSplit: "3-5",
      starter: null,
    },
    venue: null,
    odds: dk,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    injuriesFetchedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    ...over,
  };
}

function stubPick(model: string, over: Partial<RankPick> = {}): RankPick {
  return {
    market: "spread",
    side: "home",
    selection: "SEA -3",
    line: -3,
    price: -110,
    edgePct: 8,
    confidence: 72,
    why: "verified-challenger",
    model,
    probability: 0.58,
    noVigImplied: 0.52,
    dataQuality: 90,
    passReason: null,
    pickTier: "lock",
    ...over,
  };
}

const NFL_CHALLENGER = "verified-nfl-challenger-1";
const MLB_CHALLENGER = "verified-mlb-challenger-1";

function installNflChallenger(): void {
  registerProductionRanker(NFL_CHALLENGER, () => stubPick(NFL_CHALLENGER));
  const verified = verifyChallenger({ version: NFL_CHALLENGER, sport: "nfl", ceoApproved: true, reason: "test" });
  assert.equal(verified.ok, true);
  const promoted = promoteSportChampion({ version: NFL_CHALLENGER, sport: "nfl", ceoApproved: true, reason: "test" });
  assert.equal(promoted.ok, true);
}

test("V2 remains the default champion for every sport until CEO promotes", () => {
  for (const [sport, version] of Object.entries(PRODUCTION_MODELS)) {
    assert.equal(championFor(sport), version);
    assert.equal(canQueueOfficial(version), true);
    assert.equal(isVerifiedModel(version, sport), true);
  }
  assert.equal(canQueueOfficial("v3-nfl-logreg"), false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
  assert.equal(canQueueOfficial("model-yacht-nfl-2026.09.2"), false);
  const nfl = rankGame(game());
  if (nfl) assert.equal(nfl.model, "v2-nfl");
});

test("sportOfVersion does not confuse wnba with nba", () => {
  assert.equal(sportOfVersion("v2-wnba"), "wnba");
  assert.equal(sportOfVersion("v2-nba"), "nba");
  assert.equal(sportOfVersion("v3-ncaaf-logreg"), "ncaaf");
  assert.equal(sportOfVersion("model-yacht-nfl-2026.09.2"), "nfl");
  assert.equal(sportOfVersion("not-a-model"), null);
});

test("unverified models cannot become champion even with CEO approval", () => {
  registerProductionRanker(NFL_CHALLENGER, () => stubPick(NFL_CHALLENGER));
  const blocked = promoteSportChampion({ version: NFL_CHALLENGER, sport: "nfl", ceoApproved: true });
  assert.equal(blocked.ok, false);
  assert.match(blocked.note, /not verified/);
  assert.equal(championFor("nfl"), "v2-nfl");
  assert.equal(canQueueOfficial(NFL_CHALLENGER), false);
});

test("verify and promote without CEO approval are blocked", () => {
  const v = verifyChallenger({ version: NFL_CHALLENGER, sport: "nfl" });
  assert.equal(v.ok, false);
  assert.match(v.note, /CEO approval/);
  const p = promoteSportChampion({ version: "v2-nfl", sport: "nfl" });
  assert.equal(p.ok, false);
  const r = rollbackSportChampion({ sport: "nfl" });
  assert.equal(r.ok, false);
  assert.equal(championFor("nfl"), "v2-nfl");
});

test("lab candidate mark does not change the live champion", () => {
  const stats = { n: 400, brier: 0.18, roi: 0.08, clv: 0.02, calibrationDelta: 0.01, maxDrawdown: -4 };
  const champ = { n: 500, brier: 0.22, roi: 0.01, clv: 0.005, calibrationDelta: 0.02, maxDrawdown: -6 };
  const marked = promoteChallenger({ version: "v3-nfl-logreg", sport: "nfl", stats, champion: champ });
  assert.equal(marked.ok, true);
  assert.equal(marked.livePosting, false);
  assert.equal(championFor("nfl"), "v2-nfl");
  assert.equal(canQueueOfficial("v3-nfl-logreg"), false);
  assert.equal(canQueueOfficial("v2-nfl"), true);
});

test("missing production ranker cannot be promoted", () => {
  const verified = verifyChallenger({ version: NFL_CHALLENGER, sport: "nfl", ceoApproved: true });
  assert.equal(verified.ok, true);
  assert.equal(productionRankerFor(NFL_CHALLENGER), null);
  const promoted = promoteSportChampion({ version: NFL_CHALLENGER, sport: "nfl", ceoApproved: true });
  assert.equal(promoted.ok, false);
  assert.match(promoted.note, /No production ranker/);
  assert.equal(championFor("nfl"), "v2-nfl");
});

test("correct sport model is used after a verified challenger is promoted", () => {
  installNflChallenger();
  assert.equal(championFor("nfl"), NFL_CHALLENGER);
  assert.equal(canQueueOfficial(NFL_CHALLENGER), true);
  assert.equal(canQueueOfficial("v2-nfl"), false);
  const ranked = rankGame(game());
  assert.ok(ranked);
  assert.equal(ranked?.model, NFL_CHALLENGER);
  assert.equal(qualifyOfficial({ ...game(), rank: ranked }, 3, 58), true);
  assert.equal(qualifyOfficial({ ...game(), rank: stubPick("v2-nfl") }, 3, 58), false);
});

test("one sport's promotion cannot change another sport", () => {
  installNflChallenger();
  registerProductionRanker(MLB_CHALLENGER, () => stubPick(MLB_CHALLENGER, { market: "moneyline", selection: "LAD ML", line: null }));
  verifyChallenger({ version: MLB_CHALLENGER, sport: "mlb", ceoApproved: true });
  assert.equal(championFor("mlb"), "v2-mlb");
  assert.equal(canQueueOfficial("v2-mlb"), true);
  assert.equal(canQueueOfficial("v2-nba"), true);
  assert.equal(canQueueOfficial("v2-nhl"), true);
  const mlb = rankGame(
    game({
      id: "mlb:1",
      league: "mlb",
      sport: "MLB",
      odds: { ...dk, total: 8.5, homeSpread: null, awaySpread: null },
      home: {
        name: "Dodgers",
        abbr: "LAD",
        logo: null,
        score: null,
        record: "80-50",
        homeSplit: "42-20",
        roadSplit: "38-30",
        starter: { name: "A", era: 3.1, whip: 1.1, savePct: null, position: "SP" },
      },
      away: {
        name: "Giants",
        abbr: "SF",
        logo: null,
        score: null,
        record: "70-60",
        homeSplit: "38-28",
        roadSplit: "32-32",
        starter: { name: "B", era: 4.1, whip: 1.3, savePct: null, position: "SP" },
      },
    }),
  );
  if (mlb) assert.equal(mlb.model, "v2-mlb");
  const champs = allChampions();
  assert.equal(champs.nfl, NFL_CHALLENGER);
  assert.equal(champs.mlb, "v2-mlb");
  assert.equal(champs.nba, "v2-nba");
});

test("rollback restores the previous champion for that sport only", () => {
  installNflChallenger();
  assert.equal(previousChampion("nfl"), "v2-nfl");
  const rolled = rollbackSportChampion({ sport: "nfl", ceoApproved: true });
  assert.equal(rolled.ok, true);
  assert.equal(championFor("nfl"), "v2-nfl");
  assert.equal(canQueueOfficial("v2-nfl"), true);
  assert.equal(canQueueOfficial(NFL_CHALLENGER), false);
  assert.equal(previousChampion("nfl"), NFL_CHALLENGER);
  const ranked = rankGame(game());
  if (ranked) assert.equal(ranked.model, "v2-nfl");
  assert.equal(championFor("mlb"), "v2-mlb");
});

test("promotion history is persisted in memory for verify, promote, and rollback", () => {
  installNflChallenger();
  rollbackSportChampion({ sport: "nfl", ceoApproved: true, reason: "ceo rollback" });
  const events = championHistory();
  assert.equal(events.length, 3);
  assert.equal(events[0]?.action, "verify");
  assert.equal(events[1]?.action, "promote");
  assert.equal(events[1]?.fromVersion, "v2-nfl");
  assert.equal(events[1]?.toVersion, NFL_CHALLENGER);
  assert.equal(events[2]?.action, "rollback");
  assert.equal(events[2]?.toVersion, "v2-nfl");
});

test("truth gate model identity follows the active sport champion; DK/freeze gates stay in force", () => {
  const now = Date.now();
  const live = game({
    id: "mlb:mia",
    league: "mlb",
    sport: "MLB",
    startAt: new Date(now + 3 * 3600_000).toISOString(),
    fetchedAt: new Date(now).toISOString(),
    injuriesFetchedAt: new Date(now).toISOString(),
    startersFetchedAt: new Date(now).toISOString(),
    odds: {
      ...dk,
      book: "DraftKings",
      source: "odds-api",
      homeMl: 135,
      awayMl: -155,
      capturedAt: new Date(now - 60_000).toISOString(),
    },
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
  });
  const queued = {
    gameId: live.id,
    league: live.league,
    homeName: live.home.name,
    awayName: live.away.name,
    startAt: live.startAt,
    espnId: live.espnId,
    market: "moneyline" as const,
    homeStarter: live.home.starter?.name ?? null,
    awayStarter: live.away.starter?.name ?? null,
    freezeJson: null as string | null,
    status: "queued",
  };
  const v2Rank: RankPick = {
    market: "moneyline",
    side: "home",
    selection: "MIA ML",
    line: null,
    price: 135,
    edgePct: 8,
    confidence: 64,
    why: "arms",
    model: "v2-mlb",
    probability: 0.48,
    noVigImplied: 0.4,
    dataQuality: 88,
    passReason: null,
    pickTier: "lock",
  };
  const defaultGate = prePostTruthCheck({ queued, live, rank: v2Rank, minEdge: 3, minConf: 58, now });
  assert.equal(defaultGate.ok, true);

  registerProductionRanker(MLB_CHALLENGER, () => stubPick(MLB_CHALLENGER, { market: "moneyline", selection: "MIA ML", line: null, price: 135 }));
  verifyChallenger({ version: MLB_CHALLENGER, sport: "mlb", ceoApproved: true });
  promoteSportChampion({ version: MLB_CHALLENGER, sport: "mlb", ceoApproved: true });

  const staleV2 = prePostTruthCheck({ queued, live, rank: v2Rank, minEdge: 3, minConf: 58, now });
  assert.equal(staleV2.ok, false);
  if (!staleV2.ok) assert.equal(staleV2.reason, "PASS_CRITICAL_DATA_MISSING");

  const champRank: RankPick = { ...v2Rank, model: MLB_CHALLENGER };
  const champGate = prePostTruthCheck({ queued, live, rank: champRank, minEdge: 3, minConf: 58, now });
  assert.equal(champGate.ok, true);

  const staleDk = prePostTruthCheck({
    queued,
    live: { ...live, odds: { ...live.odds, capturedAt: new Date(now - 45 * 60_000).toISOString() } },
    rank: champRank,
    minEdge: 3,
    minConf: 58,
    now,
  });
  assert.equal(staleDk.ok, false);
  if (!staleDk.ok) assert.equal(staleDk.reason, "PASS_DK_STALE");
});

test("isActiveChampion is per-version and follows the sport pointer", () => {
  assert.equal(isActiveChampion("v2-nfl"), true);
  installNflChallenger();
  assert.equal(isActiveChampion(NFL_CHALLENGER), true);
  assert.equal(isActiveChampion("v2-nfl"), false);
  assert.equal(isActiveChampion("v2-mlb"), true);
});
