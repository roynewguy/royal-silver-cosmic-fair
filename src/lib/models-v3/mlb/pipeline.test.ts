import assert from "node:assert/strict";
import { test } from "node:test";
import { rankMlb } from "../../sports/models/mlb.ts";
import { rankGame } from "../../sports/rank.ts";
import type { GameCard, OddsSnapshot } from "../../sports/types.ts";
import { brier, logLoss } from "../evaluate.ts";
import { assertNoFutureGames, priorGames, rowUsesScoresAsFeatures } from "../leakage.ts";
import { clampProb, fitLogReg, predictLogReg } from "../logreg.ts";
import { canQueueOfficial, isShadowModel, PRODUCTION_MODELS } from "../registry.ts";
import { assertChronological, chronologicalSplit } from "../splits.ts";
import { parseCoreOdds } from "./parse.ts";
import { buildMlbRows, featureVector, teamFeatures } from "./features.ts";
import type { HistoricalGame, HistoricalOdds } from "../types.ts";

const oddsSnap: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: -120,
  awayMl: 100,
  homeSpread: null,
  awaySpread: null,
  homeSpreadOdds: null,
  awaySpreadOdds: null,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: null,
  source: "odds-api",
  capturedAt: null,
};

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:1",
    espnId: "1",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Marlins", abbr: "MIA", logo: null, score: null, record: "70-70", homeSplit: "40-30", roadSplit: "30-40", starter: { name: "A", era: 3.5, whip: 1.1, savePct: null, position: "SP" } },
    away: { name: "Cubs", abbr: "CHC", logo: null, score: null, record: "80-60", homeSplit: "42-28", roadSplit: "38-32", starter: { name: "B", era: 4.2, whip: 1.3, savePct: null, position: "SP" } },
    venue: null,
    odds: oddsSnap,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

function game(id: string, start: string, home: string, away: string, hs: number, as: number): HistoricalGame {
  return {
    gameId: id,
    espnId: id,
    sport: "MLB",
    league: "mlb",
    season: 2025,
    startAt: start,
    homeTeam: home,
    awayTeam: away,
    homeAbbr: home,
    awayAbbr: away,
    homeScore: hs,
    awayScore: as,
    status: "final",
    venue: "Park",
    homeWin: hs > as,
  };
}

function slate(): { games: HistoricalGame[]; odds: HistoricalOdds[] } {
  const teams = ["AAA", "BBB", "CCC", "DDD"];
  const games: HistoricalGame[] = [];
  let n = 0;
  const start = Date.parse("2025-04-01T17:00:00Z");
  for (let d = 0; d < 40; d += 1) {
    for (let k = 0; k < 2; k += 1) {
      const home = teams[(d + k) % 4];
      const away = teams[(d + k + 1) % 4];
      const hs = (d + k) % 3 === 0 ? 2 : 5;
      const as = hs === 5 ? 1 : 6;
      const t = new Date(start + d * 86_400_000 + k * 3600_000).toISOString();
      games.push(game(`g${n}`, t, home, away, hs, as));
      n += 1;
    }
  }
  const odds: HistoricalOdds[] = games.map((g, i) => ({
    gameId: g.gameId,
    sportsbook: "ESPN BET",
    market: "moneyline",
    homeOpen: i % 2 ? -110 : 105,
    awayOpen: i % 2 ? -110 : -125,
    homeClose: i % 2 ? -115 : 100,
    awayClose: i % 2 ? -105 : -120,
  }));
  return { games, odds };
}

test("production MLB ranker is still v2-mlb", () => {
  assert.equal(PRODUCTION_MODELS.mlb, "v2-mlb");
  const r = rankMlb(card()) ?? rankGame(card());
  if (r) assert.equal(r.model, "v2-mlb");
  assert.equal(canQueueOfficial("v3-mlb-logreg-2026-09-04"), false);
  assert.equal(canQueueOfficial("v2-mlb"), true);
  assert.equal(isShadowModel("v3-mlb-logreg-2026-09-04"), true);
});

test("prior games never include the current or future start", () => {
  const { games } = slate();
  const target = games[30];
  const priors = priorGames(games, target.homeAbbr, target.startAt);
  assertNoFutureGames(priors, target.startAt);
  assert.equal(priors.some((g) => g.gameId === target.gameId), false);
  assert.throws(() => teamFeatures([games[31]], target.homeAbbr, target.startAt));
});

test("feature json does not carry scores", () => {
  const { games, odds } = slate();
  const { rows } = buildMlbRows(games, odds, {});
  assert.ok(rows.length > 20);
  for (const row of rows) {
    assert.equal(row.features.knownBeforeStart, true);
    assert.equal(rowUsesScoresAsFeatures(JSON.stringify(row.features)), false);
    const x = featureVector(row);
    assert.equal(x.length, 8);
  }
});

test("chronological split does not shuffle the future into train", () => {
  const { games, odds } = slate();
  const { rows } = buildMlbRows(games, odds, {});
  const split = chronologicalSplit(rows, { trainTo: "2025-04-20T00:00:00Z", validTo: "2025-04-30T00:00:00Z" });
  assertChronological(split);
  assert.ok(split.train.length > 0);
});

test("doubleheaders keep separate odds by game id", () => {
  const a = parseCoreOdds("mlb:espn:1", {
    items: [{ provider: { id: "58", name: "ESPN BET" }, homeTeamOdds: { moneyLine: -130 }, awayTeamOdds: { moneyLine: 110 } }],
  });
  const b = parseCoreOdds("mlb:espn:2", {
    items: [{ provider: { id: "58", name: "ESPN BET" }, homeTeamOdds: { moneyLine: 120 }, awayTeamOdds: { moneyLine: -140 } }],
  });
  assert.equal(a?.gameId, "mlb:espn:1");
  assert.equal(b?.gameId, "mlb:espn:2");
  assert.notEqual(a?.homeClose ?? a?.homeOpen, b?.homeClose ?? b?.homeOpen);
});

test("probabilities stay in (0,1) and missing history drops safely", () => {
  const p = clampProb(predictLogReg([1, 2], fitLogReg([[1, 0.2], [1, -0.2]], [1, 0])));
  assert.ok(p > 0 && p < 1);
  const { rows, dropped } = buildMlbRows(
    [game("x", "2025-04-01T00:00:00Z", "AAA", "BBB", 4, 1)],
    [],
    {},
  );
  assert.equal(rows.length, 0);
  assert.ok(dropped >= 1);
});

test("dataset builder is deterministic", () => {
  const { games, odds } = slate();
  const a = buildMlbRows(games, odds, {});
  const b = buildMlbRows(games, odds, {});
  assert.equal(JSON.stringify(a.rows.map((r) => r.gameId)), JSON.stringify(b.rows.map((r) => r.gameId)));
});

test("brier and logloss are defined on a tiny eval set", () => {
  const rows = [
    { p: 0.7, y: 1, stakePrice: -120, closePrice: -130 },
    { p: 0.4, y: 0, stakePrice: 110, closePrice: 100 },
  ];
  assert.ok(brier(rows) < 1);
  assert.ok(logLoss(rows) > 0);
});

test("shadow predictions cannot become official picks", () => {
  assert.equal(canQueueOfficial("v3-mlb-logreg-2026-09-04"), false);
});
