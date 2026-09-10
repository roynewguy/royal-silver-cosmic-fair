import assert from "node:assert/strict";
import { test } from "node:test";
import { fitGbt, predictGbt } from "./gbt.ts";
import { fitIntelLogReg, predictIntelLogReg } from "./logreg.ts";
import { logLossScore } from "../calibration.ts";

function toy() {
  const x: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 80; i += 1) {
    const a = i < 40 ? 0.2 : 0.8;
    const b = i < 40 ? 0.1 : 0.9;
    x.push([1, a, b]);
    y.push(i < 40 ? 0 : 1);
  }
  return { x, y };
}

test("logreg and gbt beat an uninformed 0.5 on a separable toy set", () => {
  const { x, y } = toy();
  const log = fitIntelLogReg(x, y, { steps: 400 });
  const gbt = fitGbt(x, y, { nTrees: 12, depth: 2, minLeaf: 4, lr: 0.2 });
  const lp = x.map((row) => ({ p: predictIntelLogReg(row, log), y: y[x.indexOf(row)] as 0 | 1 }));
  const gp = x.map((row, i) => ({ p: predictGbt(row, gbt), y: y[i] as 0 | 1 }));
  const naive = x.map((_, i) => ({ p: 0.5, y: y[i] as 0 | 1 }));
  assert.ok((logLossScore(lp) ?? 9) < (logLossScore(naive) ?? 0));
  assert.ok((logLossScore(gp) ?? 9) < (logLossScore(naive) ?? 0));
});
