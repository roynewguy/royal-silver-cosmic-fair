import { isYachtSport, sportFromYachtVersion, type YachtSport } from "./versioning.ts";

/**
 * Model Yacht predicts probabilities. BET/PASS, truth gate, freeze, posting
 * stay in the existing BoatBoyz system. Never bury sportsbook logic here.
 */
export type YachtPrediction = {
  sport: YachtSport;
  modelVersion: string;
  probability: number;
  uncertainty: number;
  dataQuality: number;
  predictionAt: string;
  featureSnapshotId: string;
  official: false;
};

function unitInterval(name: string, n: number, allowNull = false): void {
  void allowNull;
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`Yacht prediction ${name} must be between 0 and 1`);
  }
}

function optionalUnit(name: string, n: number | null | undefined): void {
  if (n == null) return;
  unitInterval(name, n);
}

export function yachtPrediction(input: {
  sport: string;
  modelVersion: string;
  probability: number;
  uncertainty: number;
  dataQuality: number;
  predictionAt: string;
  featureSnapshotId: string;
  official?: boolean;
}): YachtPrediction {
  if (input.official === true) {
    throw new Error("Yacht prediction cannot be official");
  }
  if (!isYachtSport(input.sport)) {
    throw new Error(`Yacht prediction unknown sport ${input.sport}`);
  }
  if (sportFromYachtVersion(input.modelVersion) !== input.sport) {
    throw new Error("Yacht prediction sport/model mismatch");
  }
  unitInterval("probability", input.probability);
  optionalUnit("uncertainty", input.uncertainty);
  optionalUnit("dataQuality", input.dataQuality);
  return {
    sport: input.sport,
    modelVersion: input.modelVersion,
    probability: input.probability,
    uncertainty: input.uncertainty,
    dataQuality: input.dataQuality,
    predictionAt: input.predictionAt,
    featureSnapshotId: input.featureSnapshotId,
    official: false,
  };
}
