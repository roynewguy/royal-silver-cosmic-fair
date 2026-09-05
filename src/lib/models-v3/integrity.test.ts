import assert from "node:assert/strict";
import { test } from "node:test";
import { featureVector } from "./features.ts";
import { honestBacktest } from "./evaluate.ts";
import { BACKTEST_AUDIT, inCanonicalWindow } from "./integrity.ts";
import { buildLiveTrainingRow, gameCardToHistorical } from "./live-features.ts";
import { liveFeatureVector, shadowPredict } from "./shadow.ts";
import { v2HomeProbability } from "./v2-prob.ts";
import { canQueueOfficial } from "./registry.ts";
import type { GameCard, OddsSnapshot } from "../sports/types.ts";
import type { HistoricalGame, LogRegArtifact } from "./types.ts";

const odds: OddsSnapshot = {
  book: "DraftKings",
  details: null,
  homeMl: 135,
  awayMl: -155,
  homeSpread: 1.5,
  awaySpread: -1.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 8.5,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: 140,
  source: "odds-api",
  capturedAt: null,
};

function card(over: Partial<GameCard> = {}): GameCard {
  return {
    id: "mlb:live",
    espnId: "9",
    sport: "MLB",
    league: "mlb",
    startAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    status: "scheduled",
    home: { name: "Marlins", abbr: "MIA", logo: null, score: null, record: "70-70", homeSplit: null, roadSplit: null, starter: { name: "Junk", era: 4.1, whip: 1.2, savePct: null, position: "SP" } },
    away: { name: "Cubs", abbr: "CHC", logo: null, score: null, record: "80-60", homeSplit: null, roadSplit: null, starter: { name: "Shota", era: 3.2, whip: 1.1, savePct: null, position: "SP" } },
    venue: "loanDepot",
    odds,
    rank: { market: "moneyline", side: "home", selection: "MIA ML", line: null, price: 135, edgePct: 4, confidence: 62, why: "x", model: "v2-mlb", probability: 0.47 },
    notes: [],
    injuries: [],
    weather: null,
    ...over,
  };
}

function hist(id: string, start: string, home: string, away: string, hs: number, as: number): HistoricalGame {
  return {
    gameId: id,
    espnId: id,
    sport: "MLB",
    league: "mlb",
    season: 2026,
    startAt: start,
    homeTeam: home,
    awayTeam: away,
    homeAbbr: home,
    awayAbbr: away,
    homeScore: hs,
    awayScore: as,
    status: "final",
    venue: null,
    homeWin: hs > as,
  };
}

function priors(): HistoricalGame[] {
  const start = Date.parse("2026-08-01T17:00:00Z");
  const teams = ["MIA", "CHC", "NYY", "BOS"];
  const games: HistoricalGame[] = [];
  let n = 0;
  for (let d = 0; d < 16; d += 1) {
    for (let k = 0; k < 2; k += 1) {
      games.push(
        hist(
          `p${n}`,
          new Date(start + d * 86400000 + k * 3600000).toISOString(),
          teams[(d + k) % 4],
          teams[(d + k + 1) % 4],
          5,
          2,
        ),
      );
      n += 1;
    }
  }
  return games;
}

test("live shadow does not substitute zeros for last5/rest/rdiff", () => {
  assert.equal(liveFeatureVector(card()), null);
  const built = buildLiveTrainingRow(card(), priors());
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const x = built.vector;
  assert.equal(x.length, 8);
  assert.ok(built.row.features.home.last5 >= 0 && built.row.features.home.last5 <= 1);
  assert.ok(built.row.features.home.last10 >= 0 && built.row.features.home.last10 <= 1);
  assert.ok(built.row.features.home.restDays != null);
  assert.notEqual(built.row.features.home.runDiffPg, null);
  assert.equal(JSON.stringify(built.row.features).includes("\"score\""), false);
  assert.deepEqual(x, featureVector(built.row));
});

test("missing priors skip the live shadow instead of faking form", () => {
  const built = buildLiveTrainingRow(card(), []);
  assert.equal(built.ok, false);
  assert.ok(built.missing.includes("home_form"));
});

test("live features never include the current game or future games", () => {
  const live = card();
  const future = hist("fut", new Date(Date.now() + 86400000).toISOString(), "MIA", "CHC", 9, 1);
  const built = buildLiveTrainingRow(live, priors().concat(future, gameCardToHistorical({ ...live, status: "final", home: { ...live.home, score: 12 }, away: { ...live.away, score: 0 } })));
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.row.features.home.games >= 10, true);
});

test("canonical window is the 3 hours before start", () => {
  const start = Date.now() + 90 * 60_000;
  assert.equal(inCanonicalWindow(new Date(start).toISOString(), Date.now()), true);
  assert.equal(inCanonicalWindow(new Date(Date.now() + 5 * 3600_000).toISOString(), Date.now()), false);
  assert.equal(inCanonicalWindow(new Date(Date.now() - 1000).toISOString(), Date.now()), false);
});

test("honest backtest refuses closer-as-stake and requires openers", () => {
  const rows = [
    { p: 0.6, y: 1, stakePrice: -110, closePrice: -130, homePrice: -110, awayPrice: -110, closeHome: -130, closeAway: 110, homeOpen: null, awayOpen: null },
  ];
  const honest = honestBacktest(rows, 0.03);
  assert.equal(honest.n, 0);
});

test("V2 vs V3 compare only uses overlapping moneyline home probabilities", () => {
  assert.equal(v2HomeProbability({ market: "moneyline", side: "home", modelProbability: 0.58 }), 0.58);
  const away = v2HomeProbability({ market: "moneyline", side: "away", modelProbability: 0.58 });
  assert.ok(away != null && Math.abs(away - 0.42) < 1e-9);
  assert.equal(v2HomeProbability({ market: "spread", side: "home", modelProbability: 0.58 }), null);
});

test("shadow predictions cannot become official", () => {
  const art: LogRegArtifact = {
    modelVersion: "v3-mlb-logreg-2026-09-05",
    sport: "MLB",
    target: "home_win",
    trainedAt: new Date().toISOString(),
    trainFrom: "",
    trainTo: "",
    validFrom: "",
    validTo: "",
    testFrom: "",
    testTo: "",
    featureNames: ["bias"],
    means: [0, 0, 0, 0, 0, 0, 0, 0],
    stds: [1, 1, 1, 1, 1, 1, 1, 1],
    weights: [0, 0, 0, 0, 0, 0, 0, 0],
    metrics: {},
    notes: [],
  };
  const pred = shadowPredict(card(), art, priors());
  assert.equal(pred?.official, false);
  assert.equal(canQueueOfficial(pred?.modelVersion), false);
  assert.match(BACKTEST_AUDIT.starterEra, /NOT proven point-in-time/i);
});
