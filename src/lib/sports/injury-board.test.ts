import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInjuryBoard } from "./injury-board.ts";

test("ESPN league injuries use team displayName and preserve athlete status", () => {
  assert.deepEqual(parseInjuryBoard({ injuries: [{ id: "1", displayName: "Seattle Mariners", injuries: [
    { status: "Out", athlete: { displayName: "Player A", position: { abbreviation: "SP" } } },
  ] }] }), [{ teamName: "Seattle Mariners", abbr: null, player: "Player A", status: "Out", position: "SP" }]);
});
test("empty fetched board is distinct from unavailable or incomplete board", () => {
  assert.deepEqual(parseInjuryBoard({ injuries: [] }), []);
  assert.equal(parseInjuryBoard({}), null);
  assert.equal(parseInjuryBoard({ injuries: [{ displayName: "Team" }] }), null);
  assert.equal(parseInjuryBoard({ injuries: [{ displayName: "Team", injuries: [{}] }] }), null);
});
test("legacy team-abbreviation board remains supported", () => {
  assert.equal(parseInjuryBoard({ teams: [{ team: { abbreviation: "SEA" }, injuries: [
    { status: "Out", athlete: { displayName: "Player A" } },
  ] }] })?.[0].abbr, "SEA");
});
