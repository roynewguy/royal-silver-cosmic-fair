import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDraftKingsSnapshot, shouldFetchLeagueOdds } from "./dk-open.ts";
import { applyModelInputs, packModelInputs } from "./model-inputs.ts";
import { parseWindMph, windUnderLean } from "./models/weather.ts";
import { parseResearchPlays, shouldRefreshResearch } from "./research-schema.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

const espn: OddsSnapshot = {
  book: "ESPN",
  details: null,
  homeMl: -140,
  awayMl: 120,
  homeSpread: -3,
  awaySpread: 3,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  total: 44,
  overOdds: -110,
  underOdds: -110,
  openHomeSpread: -2.5,
  openTotal: 43,
  openHomeMl: -135,
  source: "espn",
  capturedAt: null,
};

const dk: OddsSnapshot = {
  ...espn,
  book: "DraftKings",
  homeSpread: -3.5,
  awaySpread: 3.5,
  source: "odds-api",
  openHomeSpread: null,
  openTotal: null,
  openHomeMl: null,
};

test("DraftKings observed opener ignores ESPN open", () => {
  const first = applyDraftKingsSnapshot(espn, dk);
  assert.equal(first.openHomeSpread, -3.5);
  assert.equal(first.source, "odds-api");
  const later = applyDraftKingsSnapshot(first, { ...dk, homeSpread: -4 });
  assert.equal(later.openHomeSpread, -3.5);
  assert.equal(later.homeSpread, -4);
});

test("Odds API skips leagues with no scheduled games", () => {
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 0, hoursToKick: 2, lastFetchAgeMs: 99_000_000 }), false);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 3, hoursToKick: 2, lastFetchAgeMs: 9 * 60_000 }), true);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 3, hoursToKick: 2, lastFetchAgeMs: 2 * 60_000 }), false);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 3, hoursToKick: 30, lastFetchAgeMs: 10 * 60_000 }), false);
  assert.equal(shouldFetchLeagueOdds({ scheduledCount: 3, hoursToKick: 30, lastFetchAgeMs: 50 * 60_000 }), true);
});

test("NFL wind under 10 mph is ignored; 20+ is stronger", () => {
  assert.equal(parseWindMph("Sunny · wind 6"), 6);
  assert.equal(windUnderLean("Sunny · wind 6").under, 0);
  assert.ok((windUnderLean("Cloudy · wind 12").under ?? 0) > 0);
  assert.ok((windUnderLean("Windy · wind 22").under ?? 0) > (windUnderLean("Windy · wind 12").under ?? 0));
  assert.equal(parseWindMph("A windy evening"), null);
});

test("Grok schema keeps APPROVE/PASS only and drops unknown games", () => {
  const parsed = parseResearchPlays(
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              plays: [
                { gameId: "nfl:1", skip: false, reason: "Splits hold.", confidence: 91, units: 5, market: "spread", side: "home" },
                { gameId: "hacked", skip: false, reason: "nope" },
              ],
            }),
          },
        },
      ],
    },
    ["nfl:1"],
  );
  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0]?.gameId, "nfl:1");
  assert.equal(parsed?.[0]?.skip, false);
  assert.equal("confidence" in (parsed?.[0] ?? {}), false);
  assert.equal("units" in (parsed?.[0] ?? {}), false);
});

test("research cache does not refresh on unchanged fingerprint far from kick", () => {
  assert.equal(
    shouldRefreshResearch({
      cachedFingerprint: "abc",
      currentFingerprint: "abc",
      cacheAgeMs: 60_000,
      hoursToKick: 10,
      postLeadHours: 2.5,
    }),
    false,
  );
  assert.equal(
    shouldRefreshResearch({
      cachedFingerprint: "abc",
      currentFingerprint: "xyz",
      cacheAgeMs: 1_000,
      hoursToKick: 10,
      postLeadHours: 2.5,
    }),
    true,
  );
});

test("V2 model inputs survive pack/apply", () => {
  const game = {
    home: { homeSplit: "7-1", roadSplit: "4-4", starter: { name: "Geno", era: null, whip: null, savePct: null, position: "QB" } },
    away: { homeSplit: "5-3", roadSplit: "3-5", starter: null },
    injuries: [{ team: "home", player: "DK Metcalf", status: "out", position: "WR" }],
    weather: "wind 18",
    notes: ["B2B"],
    rank: { model: "v2-nfl" },
  } as unknown as GameCard;
  const packed = packModelInputs(game);
  const restored = applyModelInputs(
    {
      home: { homeSplit: null, roadSplit: null, starter: null },
      away: { homeSplit: null, roadSplit: null, starter: null },
      injuries: [],
      weather: null,
      notes: [],
    } as unknown as GameCard,
    packed,
  );
  assert.equal(restored.home.homeSplit, "7-1");
  assert.equal(restored.home.starter?.name, "Geno");
  assert.equal(restored.injuries[0]?.player, "DK Metcalf");
  assert.equal(restored.weather, "wind 18");
  assert.equal(packed.modelVersion, "v2-nfl");
});
