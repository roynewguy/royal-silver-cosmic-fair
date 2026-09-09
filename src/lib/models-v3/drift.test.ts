import assert from "node:assert/strict";
import { test } from "node:test";
import { driftReport, windowStats } from "./drift.ts";

test("thin samples never flag drift", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ p: 0.6, y: i % 2 }));
  const d = driftReport(rows);
  assert.equal(d.flag, false);
  assert.equal(windowStats(rows, 50).n, 20);
});

test("a recent collapse versus a longer healthy window flags drift", () => {
  const healthy = Array.from({ length: 200 }, () => ({ p: 0.58, y: 1 }));
  const recent = Array.from({ length: 50 }, () => ({ p: 0.7, y: 0 }));
  const d = driftReport([...recent, ...healthy]);
  assert.equal(d.flag, true);
  assert.ok(d.note);
  assert.ok((d.last50Roi ?? 0) < (d.last250Roi ?? 0));
});
