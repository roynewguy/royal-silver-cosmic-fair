import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCalibrator, brierScore, expectedCalibrationError, fitCalibrator, logLossScore } from "./calibration.ts";
import { isotonicApply, isotonicFit } from "./isotonic.ts";

test("perfect forecasts have ~0 Brier and ECE", () => {
  const rows = [
    { p: 0, y: 0 as const },
    { p: 1, y: 1 as const },
    { p: 0, y: 0 as const },
    { p: 1, y: 1 as const },
  ];
  assert.equal(brierScore(rows), 0);
  assert.ok((expectedCalibrationError(rows) ?? 1) < 1e-9);
  assert.ok((logLossScore(rows) ?? 99) < 0.01);
});

test("isotonic is non-decreasing and is not fit on the test instruction", () => {
  const valid = [
    { p: 0.2, y: 0 },
    { p: 0.25, y: 0 },
    { p: 0.7, y: 1 },
    { p: 0.8, y: 1 },
    { p: 0.85, y: 1 },
  ];
  const model = isotonicFit(valid);
  const lo = isotonicApply(0.2, model);
  const hi = isotonicApply(0.8, model);
  assert.ok(hi >= lo);
});

test("calibrator fit on small valid is a no-op; Platt is allowed on larger valid", () => {
  const tiny = [{ p: 0.6, y: 1 as const }];
  assert.equal(fitCalibrator(tiny, "platt").method, "none");
  const valid = Array.from({ length: 80 }, (_, i) => ({ p: i < 40 ? 0.3 : 0.7, y: (i < 40 ? 0 : 1) as 0 | 1 }));
  const cal = fitCalibrator(valid, "platt");
  assert.equal(cal.method, "platt");
  const p = applyCalibrator(0.7, cal);
  assert.ok(p > 0 && p < 1);
});
