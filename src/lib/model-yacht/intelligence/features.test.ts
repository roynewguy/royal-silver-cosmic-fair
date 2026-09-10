import assert from "node:assert/strict";
import { test } from "node:test";
import { allFeatureContracts, featureContract } from "./features/index.ts";
import { missingKeys } from "./features/spec.ts";
import { YACHT_SPORTS } from "../core/versioning.ts";

test("every Yacht sport has an independent feature contract", () => {
  assert.deepEqual(allFeatureContracts().map((c) => c.sport).sort(), [...YACHT_SPORTS].sort());
  for (const c of allFeatureContracts()) {
    assert.equal(c.independentEngine, true);
    assert.ok(c.features.length >= 8);
    assert.ok(c.features.every((f) => f.mayBeInvented === false));
  }
});

test("NFL coefficients are not reused for NCAAF", () => {
  const nfl = featureContract("nfl");
  const ncaaf = featureContract("ncaaf");
  assert.notEqual(nfl, ncaaf);
  assert.ok(nfl.features.some((f) => f.key === "epa_off"));
  assert.equal(ncaaf.features.some((f) => f.key === "epa_off"), false);
  assert.ok(ncaaf.features.some((f) => f.key === "team_strength"));
});

test("NBA and WNBA are separate engines", () => {
  assert.notEqual(featureContract("nba").sport, featureContract("wnba").sport);
});

test("NCAAB is a dedicated contract, not a generic fallback", () => {
  const keys = featureContract("ncaab").features.map((f) => f.key);
  assert.ok(keys.includes("adj_off"));
  assert.ok(keys.includes("tempo"));
  assert.ok(keys.includes("neutral_court"));
});

test("missing advanced stats stay missing — MLB FIP/xFIP/wRC+ are not usable", () => {
  const mlb = featureContract("mlb");
  const miss = missingKeys(mlb);
  for (const k of ["fip", "xfip", "k_bb_pct", "wrc_plus", "confirmed_lineup", "park_factor", "bullpen_era_fip"]) {
    assert.ok(miss.includes(k), k);
    assert.equal(mlb.features.find((f) => f.key === k)?.usableAsFeature, false);
  }
});

test("UFC does not invent fighter stats", () => {
  const ufc = featureContract("ufc");
  assert.ok(missingKeys(ufc).includes("reach"));
  assert.ok(missingKeys(ufc).includes("td_defense"));
  assert.equal(ufc.features.find((f) => f.key === "reach")?.usableAsFeature, false);
});
