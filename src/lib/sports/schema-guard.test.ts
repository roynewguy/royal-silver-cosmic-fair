import assert from "node:assert/strict";
import { test } from "node:test";
import { espnEventOk, espnScoreboardOk, injuryBoardOk, oddsApiGameOk, oddsApiListOk } from "./schema-guard.ts";

test("unexpected ESPN scoreboard schema fails closed", () => {
  assert.equal(espnScoreboardOk(null).ok, false);
  assert.equal(espnScoreboardOk({}).ok, false);
  assert.equal(espnScoreboardOk({ events: "nope" }).ok, false);
  assert.equal(espnScoreboardOk({ events: [] }).ok, true);
});

test("unexpected ESPN event schema fails closed", () => {
  assert.equal(espnEventOk(null).ok, false);
  assert.equal(espnEventOk({ competitions: "x" }).ok, false);
  assert.equal(espnEventOk({ id: "401" }).ok, true);
});

test("unexpected Odds API schema fails closed", () => {
  assert.equal(oddsApiListOk({ data: [] }).ok, false);
  assert.equal(oddsApiListOk([]).ok, true);
  assert.equal(oddsApiGameOk({ id: "1" }).ok, false);
  assert.equal(
    oddsApiGameOk({ home_team: "SEA", away_team: "DEN", commence_time: "2026-09-09T20:00:00Z" }).ok,
    true,
  );
});

test("unexpected injury board schema fails closed", () => {
  assert.equal(injuryBoardOk(null).ok, false);
  assert.equal(injuryBoardOk({ injuries: {} }).ok, false);
  assert.equal(injuryBoardOk({ injuries: [] }).ok, true);
});
