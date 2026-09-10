import assert from "node:assert/strict";
import { test } from "node:test";
import { YACHT_MLB_DATA_MATRIX, missingFeatures } from "./data-matrix.ts";

test("matrix covers the required intelligence gaps and does not invent sources", () => {
  const by = new Map(YACHT_MLB_DATA_MATRIX.map((r) => [r.feature, r]));
  for (const name of ["FIP", "xFIP", "SIERA", "K-BB%", "wRC+", "handedness splits", "bullpen workload", "confirmed lineup", "park factor", "humidity"]) {
    const row = by.get(name);
    assert.ok(row, name);
    assert.equal(row!.currentlyAvailable, "no");
    assert.equal(row!.missing, true);
  }
  assert.equal(by.get("DraftKings")?.liveDataAvailable, "yes");
  assert.equal(by.get("DraftKings")?.historicalDataAvailable, "no");
  assert.equal(by.get("opening market")?.currentlyAvailable, "partial");
  assert.equal(missingFeatures().includes("FIP"), true);
  assert.equal(
    YACHT_MLB_DATA_MATRIX.some((r) => /^scrape /i.test(r.recommendedFutureSource)),
    false,
  );
});
