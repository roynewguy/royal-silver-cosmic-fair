import { expandingWalkForward } from "../../walk-forward.ts";
import { applyCalibrator, fitCalibrator, type Calibrator, type ProbPair } from "../../calibration.ts";
import { fitIntelLogReg, predictIntelLogReg, type LogRegIntelArtifact } from "../../models/logreg.ts";
import { fitGbt, predictGbt, type GbtArtifact } from "../../models/gbt.ts";
import { nflFeatureVector, NFL_FEATURE_SCHEMA_VERSION, NFL_VECTOR_KEYS } from "./vector.ts";
import type { NflChallengerArtifacts } from "./engine.ts";
import type { YachtFeature, YachtMarketSnapshot } from "../../../core/provenance.ts";

export type NflTrainRow = {
  startAt: string;
  predictionAt: string;
  features: YachtFeature[];
  market: YachtMarketSnapshot;
  y: 0 | 1;
  homeOpen: number | null;
  awayOpen: number | null;
  closeHome: number | null;
  closeAway: number | null;
};

export type NflFoldFit = {
  logreg: LogRegIntelArtifact;
  gbt: GbtArtifact;
  calibrator: Calibrator;
  artifacts: NflChallengerArtifacts;
};

function matrix(rows: NflTrainRow[]): { x: number[][]; y: number[] } {
  const x: number[][] = [];
  const y: number[] = [];
  for (const row of rows) {
    const v = nflFeatureVector(row.features, row.market, row.predictionAt, row.startAt);
    x.push(v.values);
    y.push(row.y);
  }
  return { x, y };
}

export function fitNflFold(train: NflTrainRow[], valid: NflTrainRow[]): NflFoldFit {
  if (!train.length) throw new Error("NFL train fold is empty");
  const { x, y } = matrix(train);
  const logreg = fitIntelLogReg(x, y, { steps: 900, lr: 0.12, l2: 0.03 });
  const gbt = fitGbt(x, y, {
    nTrees: 16,
    depth: 2,
    minLeaf: Math.max(2, Math.floor(train.length / 25)),
    lr: 0.15,
  });
  const validRaw: ProbPair[] = valid.map((row) => {
    const v = nflFeatureVector(row.features, row.market, row.predictionAt, row.startAt);
    return { p: predictIntelLogReg(v.values, logreg), y: row.y };
  });
  const calibrator = fitCalibrator(validRaw, "platt");
  const artifacts: NflChallengerArtifacts = {
    schemaVersion: NFL_FEATURE_SCHEMA_VERSION,
    featureNames: [...NFL_VECTOR_KEYS],
    logreg,
    gbt,
    calibrator,
  };
  return { logreg, gbt, calibrator, artifacts };
}

export type NflWalkForwardPlan = {
  trainTo: string;
  validTo: string;
};

/** Chronological expanding windows. Random splits are forbidden. */
export function nflWalkForward(rows: NflTrainRow[], cuts: NflWalkForwardPlan[]) {
  return expandingWalkForward(rows, cuts);
}

export function predictNflFold(rows: NflTrainRow[], art: NflFoldFit, kind: "logreg" | "gbt"): ProbPair[] {
  return rows.map((row) => {
    const v = nflFeatureVector(row.features, row.market, row.predictionAt, row.startAt);
    const raw = kind === "gbt" ? predictGbt(v.values, art.gbt) : predictIntelLogReg(v.values, art.logreg);
    return { p: applyCalibrator(raw, art.calibrator), y: row.y };
  });
}
