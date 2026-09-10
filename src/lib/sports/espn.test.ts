import assert from "node:assert/strict";
import { test } from "node:test";
import { extraScanDateKeys } from "./day.ts";
import { LEAGUE_BY_ID, LEAGUES } from "./leagues.ts";
import { espnRequestHeaders, espnScoreboardUrlCount, INJURY_CACHE_MS, ESPN_TTL_MS, overlayStaticMeta, resetEspnCaches, scoreboardTtlMs, urlsFor, starterFrom } from "./espn.ts";

test("starter comes from the athlete, never the probable role label", () => {
  const probable = { displayName: "Probable Starting Pitcher", athlete: { displayName: "Verified Athlete" } };
  assert.equal(starterFrom({ probables: [probable] })?.name, "Verified Athlete");
  assert.equal(starterFrom({ probables: [{ displayName: "Probable Starting Pitcher" }] }), null);
  assert.equal(starterFrom({ probables: [{ athlete: { displayName: "TBD" } }] }), null);
});

test("ESPN requests omit the custom user-agent rejected by the scoreboard API", () => {
  const headers = espnRequestHeaders();
  assert.equal(headers.Accept, "application/json");
  assert.equal("User-Agent" in headers, false);
});

test("daily leagues fetch today, yesterday, and tomorrow", () => {
  const now = new Date("2026-09-04T21:01:00-07:00");
  const nba = urlsFor(LEAGUE_BY_ID.nba, now);
  assert.equal(nba.length, 3);
  assert.equal(new Set(nba).size, 3);
  assert.ok(nba.every((u) => u.includes("dates=")));
  assert.ok(nba.some((u) => u.includes("dates=20260904")));
  assert.ok(nba.some((u) => u.includes("dates=20260903")));
  assert.ok(nba.some((u) => u.includes("dates=20260905")));
});

test("weekly leagues still prep tomorrow and +2", () => {
  const nfl = urlsFor(LEAGUE_BY_ID.nfl, new Date("2026-09-04T21:01:00-07:00"));
  assert.equal(nfl.length, 4);
  assert.ok(nfl.some((u) => u.includes("dates=20260904")));
  assert.ok(nfl.some((u) => u.includes("dates=20260905")));
  assert.ok(nfl.some((u) => u.includes("dates=20260906")));
});

test("operator board always loads tomorrow even on an empty weekly day", () => {
  const now = new Date("2026-09-04T12:00:00-07:00");
  assert.deepEqual(extraScanDateKeys(true, 8, now), ["20260903", "20260905"]);
  assert.ok(extraScanDateKeys(false, 0, now).includes("20260905"));
  assert.ok(extraScanDateKeys(false, 4, now).includes("20260906"));
});

test("normal tick scoreboard plan includes tomorrow without exploding", () => {
  const now = new Date("2026-09-04T19:00:00-07:00");
  const official = LEAGUES.filter((l) => l.official).length;
  assert.equal(official, 7);
  const count = espnScoreboardUrlCount(now);
  assert.equal(count, 33);
  assert.ok(count < 40);
  assert.equal(INJURY_CACHE_MS, 60 * 60_000);
});

test("PT midnight still grades yesterday", () => {
  const midnight = urlsFor(LEAGUE_BY_ID.mlb, new Date("2026-09-05T00:00:00-07:00"));
  assert.ok(midnight.some((u) => u.includes("dates=20260904")));
  assert.ok(midnight.some((u) => u.includes("dates=20260905")));
  assert.equal(midnight.length, 3);
});

test("completed and far-away slates cache; near kickoff does not", () => {
  const now = Date.parse("2026-09-09T20:00:00.000Z");
  const completed = [
    {
      status: "final" as const,
      startAt: "2026-09-09T02:00:00.000Z",
      home: { score: 4 },
      away: { score: 2 },
    },
  ];
  assert.equal(scoreboardTtlMs(completed, now), ESPN_TTL_MS.completed);
  const cancelled = [
    {
      status: "cancelled" as const,
      startAt: "2026-09-09T02:00:00.000Z",
      home: { score: null },
      away: { score: null },
    },
  ];
  assert.equal(scoreboardTtlMs(cancelled, now), ESPN_TTL_MS.completed);
  const far = [
    {
      status: "scheduled" as const,
      startAt: "2026-09-10T20:00:00.000Z",
      home: { score: null },
      away: { score: null },
    },
  ];
  assert.equal(scoreboardTtlMs(far, now), ESPN_TTL_MS.farSchedule);
  const near = [
    {
      status: "scheduled" as const,
      startAt: "2026-09-09T21:30:00.000Z",
      home: { score: null },
      away: { score: null },
    },
  ];
  assert.equal(scoreboardTtlMs(near, now), ESPN_TTL_MS.live);
  assert.equal(scoreboardTtlMs([], now), ESPN_TTL_MS.empty);
});

test("static team and venue metadata fill gaps from cache", () => {
  resetEspnCaches();
  const first = overlayStaticMeta({
    id: "mlb:1",
    venue: "Dodger Stadium",
    home: { name: "Dodgers", abbr: "LAD", logo: "https://img/lad.png", score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Padres", abbr: "SD", logo: "https://img/sd.png", score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
  } as never);
  assert.equal(first.venue, "Dodger Stadium");
  const second = overlayStaticMeta({
    id: "mlb:1",
    venue: null,
    home: { name: "Dodgers", abbr: "LAD", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Padres", abbr: "SD", logo: null, score: null, record: null, homeSplit: null, roadSplit: null, starter: null },
  } as never);
  assert.equal(second.venue, "Dodger Stadium");
  assert.equal(second.home.logo, "https://img/lad.png");
  resetEspnCaches();
});

