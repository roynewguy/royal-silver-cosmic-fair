import assert from "node:assert/strict";
import { test } from "node:test";
import { allSportsMatrix, allYachtProviders } from "./adapters.ts";
import { buildYachtDataset } from "./dataset.ts";
import { buildYachtLiveSnapshot } from "./live-snapshot.ts";
import { yachtPrediction } from "./output.ts";
import { yachtProvider } from "./provider.ts";
import { YACHT_SPORTS, yachtVersion, sportFromYachtVersion } from "./sports.ts";
import { canQueueOfficial, isShadowModel } from "../models-v3/registry.ts";
import type { HistoricalGame, HistoricalOdds } from "../models-v3/types.ts";
import type { GameCard, OddsSnapshot } from "../sports/types.ts";

test("eight independent Model Yacht engines, none of them V2", () => {
  assert.deepEqual(allYachtProviders().map((p) => p.sport).sort(), [...YACHT_SPORTS].sort());
  for (const sport of YACHT_SPORTS) {
    const p = yachtProvider(sport);
    assert.ok(p, sport);
    assert.equal(p!.contractVersion, yachtVersion(sport));
    assert.equal(sportFromYachtVersion(p!.contractVersion), sport);
    assert.equal(canQueueOfficial(p!.contractVersion), false);
    assert.equal(isShadowModel(p!.contractVersion), true);
    assert.equal(p!.contractVersion.includes("v5"), false);
  }
  assert.notEqual(yachtVersion("mlb"), yachtVersion("nfl"));
});

test("shared core does not bake baseball into other sports", () => {
  const nfl = yachtProvider("nfl")!;
  const ufc = yachtProvider("ufc")!;
  assert.equal(nfl.matrix.some((r) => r.feature === "FIP"), false);
  assert.equal(ufc.family, "fight");
  assert.equal(ufc.matrix.some((r) => /last 5 \/ last 10/.test(r.feature)), false);
  assert.ok(nfl.matrix.some((r) => r.feature === "EPA/play" && r.missing));
  assert.ok(ufc.matrix.some((r) => r.feature === "takedown defense" && r.missing));
});

test("all-sports matrix covers every league and does not invent sources", () => {
  const rows = allSportsMatrix();
  for (const sport of YACHT_SPORTS) {
    assert.ok(rows.some((r) => r.sport === sport && r.feature === "DraftKings"));
  }
  assert.equal(rows.some((r) => /^scrape /i.test(r.recommendedFutureSource)), false);
});

test("live snapshot works for NFL without MLB starter ERA", () => {
  const odds: OddsSnapshot = {
    book: "DraftKings", details: null, homeMl: -140, awayMl: 120,
    homeSpread: -3, awaySpread: 3, homeSpreadOdds: -110, awaySpreadOdds: -110,
    total: 44.5, overOdds: -110, underOdds: -110, openHomeSpread: -3, openTotal: 44,
    openHomeMl: -135, openAwayMl: 115, source: "odds-api", capturedAt: new Date().toISOString(),
  };
  const game = {
    id: "nfl:yacht", espnId: "1", sport: "NFL", league: "nfl",
    startAt: new Date(Date.now() + 4 * 3600_000).toISOString(), status: "scheduled",
    home: { name: "Chiefs", abbr: "KC", logo: null, score: null, record: "8-2", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Raiders", abbr: "LV", logo: null, score: null, record: "3-7", homeSplit: null, roadSplit: null, starter: null },
    venue: "Arrowhead", odds, rank: { market: "spread", side: "home", selection: "KC -3", line: -3, price: -110, edgePct: 4, confidence: 60, why: "x", model: "v2-nfl", probability: 0.55 },
    notes: [], injuries: [], weather: "45 F", fetchedAt: new Date().toISOString(),
  } as GameCard;
  const snap = buildYachtLiveSnapshot(game);
  assert.ok(snap);
  assert.equal(snap!.modelVersion, yachtVersion("nfl"));
  assert.equal(snap!.features.some((f) => f.key === "home_era"), false);
  assert.equal(snap!.market.awayCurrent, 120);
  assert.equal(snap!.market.homeClose, null);
  assert.equal(snap!.market.openCapturedAt, null);
});

test("NFL historical dataset uses the football adapter, not MLB", () => {
  const games: HistoricalGame[] = [];
  const start = Date.parse("2025-09-07T17:00:00Z");
  const teams = ["KC", "LV", "BUF", "MIA"];
  let n = 0;
  for (let d = 0; d < 16; d += 1) {
    games.push({
      gameId: `nfl:${n}`, espnId: String(n), sport: "NFL", league: "nfl", season: 2025,
      startAt: new Date(start + d * 7 * 86400000).toISOString(),
      homeTeam: teams[d % 4]!, awayTeam: teams[(d + 1) % 4]!, homeAbbr: teams[d % 4]!, awayAbbr: teams[(d + 1) % 4]!,
      homeScore: 24, awayScore: 17, status: "final", venue: "X", homeWin: true,
    });
    n += 1;
  }
  const odds: HistoricalOdds[] = games.map((g) => ({
    gameId: g.gameId, sportsbook: "ESPN BET", market: "moneyline",
    homeOpen: -140, awayOpen: 120, homeClose: -160, awayClose: 140,
    openCapturedAt: new Date(Date.parse(g.startAt) - 4 * 3600_000).toISOString(),
  }));
  const ds = buildYachtDataset({ provider: yachtProvider("nfl")!, games, odds, now: "2026-02-01T00:00:00Z" });
  assert.ok(ds.rows.length > 0);
  assert.equal(ds.league, "nfl");
  assert.equal(ds.rows[0]!.modelVersion, yachtVersion("nfl"));
  assert.equal(ds.rows[0]!.features.some((f) => f.key === "starter_era_home"), false);
  assert.equal(ds.rows[0]!.pregameMarket.homeClose, null);
  assert.equal(ds.rows[0]!.provenanceOk, true);
});

test("Yacht prediction contract is never official", () => {
  const pred = yachtPrediction({
    sport: "mlb",
    modelVersion: yachtVersion("mlb"),
    probability: 0.56,
    uncertainty: 0.2,
    dataQuality: 0.4,
    predictionAt: "2026-06-01T17:00:00Z",
    featureSnapshotId: "yacht_x",
  });
  assert.equal(pred.official, false);
  assert.equal(canQueueOfficial(pred.modelVersion), false);
});
