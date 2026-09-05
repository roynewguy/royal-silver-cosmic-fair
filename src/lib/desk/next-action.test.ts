import assert from "node:assert/strict";
import { test } from "node:test";
import { nextActionLine } from "./next-action.ts";

test("unarmed status is honest", () => {
  assert.match(
    nextActionLine({ automation: "unarmed", nextScanAt: null, target: 3, picks: [] }),
    /GitHub tick has not contacted/,
  );
});

test("empty card is a pass", () => {
  assert.equal(
    nextActionLine({
      automation: "online",
      nextScanAt: new Date(Date.now() + 8 * 60_000).toISOString(),
      target: 3,
      picks: [],
    }),
    "PASS — no remaining games qualify",
  );
});
