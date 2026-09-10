import assert from "node:assert/strict";
import { test } from "node:test";
import type { HistoricalGame, HistoricalOdds } from "../models-v3/types.ts";
import { buildYachtMlbDataset } from "./dataset.ts";
import { assertFeatureSetClean, yachtPriorGames } from "./leakage.ts";
import { knownAtOrBefore } from "./provenance.ts";
import { MODEL_YACHT_MLB_CONTRACT } from "./names.ts";

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
    venue: "Park",
    homeWin: hs > as,
  };
}

function slate(): { games: HistoricalGame[]; odds: HistoricalOdds[] } {
  const games: HistoricalGame[] = [];
  const start = Date.parse("2026-05-01T20:00:00Z");
  const teams = ["LAD", "SF", "NYY", "BOS"];
  let n = 0;
  for (let d = 0; d < 24; d += 1) {
    for (let k = 0; k < 2; k += 1) {
      const home = teams[(d + k) % 4]!;
      const away = teams[(d + k + 1) % 4]!;
      games.push(hist(`mlb:${n}`, new Date(start + d * 86400000 + k * 3600000).toISOString(), home, away, 5 + (n % 3), 3));
      n += 1;
    }
  }
  const odds: HistoricalOdds[] = games.map((g, i) => ({
    gameId: g.gameId,
    sportsbook: "ESPN BET",
    market: "moneyline",
    homeOpen: i % 2 ? -120 : 105,
    awayOpen: i % 2 ? 100 : -125,
    homeClose: i % 2 ? -140 : 120,
    awayClose: i % 2 ? 120 : -140,
  }));
  return { games, odds };
}

test("Yacht dataset is chronological, pregame-only, and drops incomplete markets", () => {
  const { games, odds } = slate();
  const ds = buildYachtMlbDataset({ games, odds, now: "2026-09-01T00:00:00Z" });
  assert.equal(ds.version, MODEL_YACHT_MLB_CONTRACT);
  assert.equal(ds.name, "Model Yacht MLB Dataset v1");
  assert.ok(ds.rows.length > 10);
  let prev = -Infinity;
  for (const row of ds.rows) {
    const t = Date.parse(row.startAt);
    assert.ok(t >= prev);
    prev = t;
    assert.ok(Date.parse(row.predictionAt) < Date.parse(row.startAt));
    assert.ok(Date.parse(row.startAt) <= Date.parse("2026-09-01T00:00:00Z"));
    assert.equal(row.pregameMarket.homeClose, null);
    assert.equal(row.pregameMarket.awayClose, null);
    assert.ok(row.pregameMarket.homeOpen != null && row.pregameMarket.awayOpen != null);
    assert.ok(row.closingMarket.homeClose != null);
    assert.equal(row.target.homeWin != null, true);
    assertFeatureSetClean(row.features, row.predictionAt);
    for (const f of row.features) {
      if (f.usable) assert.equal(knownAtOrBefore(f.knownAt, row.predictionAt), true);
    }
    const blob = JSON.stringify(row.features.map((f) => ({ k: f.key, v: f.value })));
    assert.equal(blob.includes(String(row.closingMarket.homeClose)), false);
    assert.equal(blob.includes("homeScore"), false);
  }
});

test("future games and missing openers are dropped, not invented", () => {
  const { games, odds } = slate();
  const future = hist("mlb:future", "2027-01-01T20:00:00Z", "LAD", "SF", 1, 0);
  const noOpen = { ...odds[40]!, homeOpen: null, awayOpen: null, gameId: games[40]!.gameId };
  const patched = odds.map((o) => (o.gameId === noOpen.gameId ? noOpen : o));
  const ds = buildYachtMlbDataset({
    games: games.concat(future),
    odds: patched,
    now: "2026-09-01T00:00:00Z",
  });
  assert.equal(ds.rows.some((r) => r.gameId === "mlb:future"), false);
  assert.ok(ds.dropped.some((d) => d.reason === "future_game"));
  assert.ok(ds.dropped.some((d) => d.reason === "PASS_MARKET_INCOMPLETE"));
});

test("same-day unfinished priors cannot leak into Yacht form", () => {
  const early = hist("a", "2026-06-01T16:00:00Z", "LAD", "SF", 9, 1);
  const late = hist("b", "2026-06-01T19:00:00Z", "LAD", "NYY", 3, 2);
  const priors = yachtPriorGames([early, late], "LAD", "2026-06-01T16:30:00Z");
  assert.equal(priors.some((g) => g.gameId === "a"), false);
});

test("unproven starter ERA is missing, not invented from the dump", () => {
  const { games, odds } = slate();
  const ds = buildYachtMlbDataset({
    games,
    odds,
    starters: { [games[20]!.gameId]: { home: { name: "Ace", era: 1.11, wins: 12, losses: 0 }, away: { name: "X", era: 9.99, wins: 0, losses: 12 } } },
    now: "2026-09-01T00:00:00Z",
  });
  const row = ds.rows[0]!;
  const era = row.features.find((f) => f.key === "starter_era_home");
  assert.equal(era?.missing, true);
  assert.equal(era?.value, null);
  assert.equal(era?.usable, false);
});
