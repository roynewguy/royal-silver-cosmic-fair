import { createHash } from "node:crypto";
import type { YachtSport } from "../core/versioning.ts";
import type { CandidateKind } from "./prediction.ts";

export const FEATURE_SCHEMA_VERSION = "yacht-intel-1";

export type CalibrationMethod = "none" | "platt" | "isotonic";

export type TrainingManifest = {
  sport: YachtSport;
  modelVersion: string;
  candidateKind: CandidateKind;
  featureSchemaVersion: string;
  trainFrom: string;
  trainTo: string;
  validFrom: string;
  validTo: string;
  testFrom: string;
  testTo: string;
  nGames: number;
  nTrain: number;
  nValid: number;
  nTest: number;
  featureList: string[];
  hyperparameters: Record<string, number | string | boolean>;
  calibrationMethod: CalibrationMethod;
  artifactChecksum: string;
  trainedAt: string;
  commitSha: string | null;
};

export function artifactChecksum(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function trainingManifest(input: Omit<TrainingManifest, "artifactChecksum"> & { artifact: unknown }): TrainingManifest {
  if (Date.parse(input.trainTo) < Date.parse(input.trainFrom)) throw new Error("train range inverted");
  if (Date.parse(input.validFrom) < Date.parse(input.trainTo)) throw new Error("valid overlaps train");
  if (Date.parse(input.testFrom) < Date.parse(input.validTo)) throw new Error("test overlaps valid");
  if (input.nGames < 0) throw new Error("nGames must be >= 0");
  return {
    sport: input.sport,
    modelVersion: input.modelVersion,
    candidateKind: input.candidateKind,
    featureSchemaVersion: input.featureSchemaVersion,
    trainFrom: input.trainFrom,
    trainTo: input.trainTo,
    validFrom: input.validFrom,
    validTo: input.validTo,
    testFrom: input.testFrom,
    testTo: input.testTo,
    nGames: input.nGames,
    nTrain: input.nTrain,
    nValid: input.nValid,
    nTest: input.nTest,
    featureList: [...input.featureList],
    hyperparameters: { ...input.hyperparameters },
    calibrationMethod: input.calibrationMethod,
    artifactChecksum: artifactChecksum(input.artifact),
    trainedAt: input.trainedAt,
    commitSha: input.commitSha,
  };
}
