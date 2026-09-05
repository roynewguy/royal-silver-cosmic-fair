import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScoreboardEvent } from "./parse.ts";
import { canQueueOfficial, PRODUCTION_MODELS } from "./registry.ts";
import { officialResearchSports } from "./sports.ts";
import { featureVector } from "./features.ts";
import { buildRows } from "./features.ts";
import type { HistoricalGame } from "./types.ts";

test("every official sport has a frozen V2 production model and a V3 prefix", () => {
  for (const spec of officialResearchSports()) {
    assert.equal(PRODUCTION_MODELS[spec.id], spec.production);
    assert.match(spec.production, /^v2-/);
    assert.match(spec.shadowPrefix, /^v3-/);
    assert.equal(canQueueOfficial(spec.production), true);
    assert.equal(canQueueOfficial(`${spec.shadowPrefix}-logreg-x`), false);
  }
});

test("soccer is not in the official research train set", () => {
  assert.equal(officialResearchSports().some((s) => s.id === "mls" || s.id === "epl"), false);
});

test("UFC scoreboard parses each fight on a card", () => {
  const fights = parseScoreboardEvent(
    {
      id: "card1",
      date: "2026-01-01T00:00:00Z",
      competitions: [
        {
          id: "f1",
          date: "2026-01-01T00:00:00Z",
          status: { type: { completed: true } },
          competitors: [
            { homeAway: "home", score: 1, athlete: { displayName: "A", shortName: "A" } },
            { homeAway: "away", score: 0, athlete: { displayName: "B", shortName: "B" } },
          ],
        },
        {
          id: "f2",
          date: "2026-01-01T01:00:00Z",
          status: { type: { completed: true } },
          competitors: [
            { homeAway: "home", score: 0, athlete: { displayName: "C", shortName: "C" } },
            { homeAway: "away", score: 1, athlete: { displayName: "D", shortName: "D" } },
          ],
        },
      ],
    },
    { id: "ufc", sport: "UFC" },
  );
  assert.equal(fights.length, 2);
  assert.equal(fights[0].game.gameId, "ufc:espn:f1");
  assert.equal(fights[1].game.gameId, "ufc:espn:f2");
});

test("NBA rows still never leak final scores into features", () => {
  const games: HistoricalGame[] = [];
  const start = Date.parse("2025-11-01T00:00:00Z");
  const teams = ["LAL", "BOS", "NYK", "MIA"];
  let n = 0;
  for (let d = 0; d < 20; d += 1) {
    for (let k = 0; k < 2; k += 1) {
      games.push({
        gameId: `nba:${n++}`,
        espnId: String(n),
        sport: "NBA",
        league: "nba",
        season: 2025,
        startAt: new Date(start + d * 86400000 + k * 3600000).toISOString(),
        homeTeam: teams[(d + k) % 4],
        awayTeam: teams[(d + k + 1) % 4],
        homeAbbr: teams[(d + k) % 4],
        awayAbbr: teams[(d + k + 1) % 4],
        homeScore: 110,
        awayScore: 102,
        status: "final",
        venue: null,
        homeWin: true,
      });
    }
  }
  const { rows } = buildRows(games, [], {}, 10);
  assert.ok(rows.length > 0);
  assert.equal(JSON.stringify(rows[0].features).includes("110"), false);
  assert.equal(featureVector(rows[0]).length, 8);
});
