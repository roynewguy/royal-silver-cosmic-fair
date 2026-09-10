import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { markYachtCollectorFailed, yachtCollectorHealth } from "./health.ts";
import { canQueueOfficial } from "../../models-v3/registry.ts";
import { YACHT_SPORTS, yachtVersion } from "../core/versioning.ts";

test("Yacht versions cannot queue official tickets", () => {
  for (const sport of YACHT_SPORTS) {
    assert.equal(canQueueOfficial(yachtVersion(sport)), false, sport);
  }
});

test("V2 tick records Yacht collection after V2 shadow and swallows failure", async () => {
  const cycle = await readFile(new URL("../../desk/cycle.ts", import.meta.url), "utf8");
  const collect = await readFile(new URL("./collect.ts", import.meta.url), "utf8");
  assert.match(cycle, /recordMlbShadow/);
  assert.match(cycle, /collectYachtWarehouseSafe/);
  assert.match(cycle, /V2 shadow soak continues/);
  assert.ok(cycle.indexOf("collectYachtWarehouseSafe") > cycle.indexOf("recordMlbShadow"));
  assert.doesNotMatch(cycle, /await collectYachtWarehouse\(/);
  assert.match(collect, /Must never throw into V2/);
  assert.match(collect, /collectYachtWarehouseSafe/);
  assert.doesNotMatch(collect, /discord/i);
  assert.doesNotMatch(collect, /canQueueOfficial/);
  assert.doesNotMatch(collect, /recordSoak/);
  assert.doesNotMatch(collect, /flushDuePosts/);
});

test("Yacht live snapshots do not use packModelInputs.capturedAt", async () => {
  const chassis = await readFile(new URL("../live-snapshot.ts", import.meta.url), "utf8");
  const mlb = await readFile(new URL("../sports/mlb/live-snapshot.ts", import.meta.url), "utf8");
  const extract = await readFile(new URL("./extract.ts", import.meta.url), "utf8");
  assert.doesNotMatch(chassis, /packModelInputs/);
  assert.doesNotMatch(mlb, /packModelInputs/);
  assert.doesNotMatch(extract, /packModelInputs\(/);
});

test("collector health turns red on failure without implying 0 V2 bets", () => {
  markYachtCollectorFailed("warehouse down");
  const h = yachtCollectorHealth();
  assert.equal(h.ok, false);
  assert.equal(h.error, "warehouse down");
});
