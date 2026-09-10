import { applyStandard, clampProb, fitLogReg, predictLogReg, standardize } from "../../../models-v3/logreg.ts";

export type LogRegIntelArtifact = {
  weights: number[];
  means: number[];
  stds: number[];
  steps: number;
  lr: number;
  l2: number;
};

export function fitIntelLogReg(
  x: number[][],
  y: number[],
  opts: { steps?: number; lr?: number; l2?: number } = {},
): LogRegIntelArtifact {
  const steps = opts.steps ?? 1800;
  const lr = opts.lr ?? 0.15;
  const l2 = opts.l2 ?? 0.02;
  const { z, means, stds } = standardize(x);
  return { weights: fitLogReg(z, y, { steps, lr, l2 }), means, stds, steps, lr, l2 };
}

export function predictIntelLogReg(row: number[], art: LogRegIntelArtifact): number {
  return clampProb(predictLogReg(applyStandard(row, art.means, art.stds), art.weights));
}
