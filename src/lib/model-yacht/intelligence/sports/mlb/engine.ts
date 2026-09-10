import { canQueueOfficial } from "../../../../models-v3/registry.ts";
import type { YachtSnapshot } from "../../../core/snapshot.ts";
import { marketBaseline } from "../../market.ts";
import { challengerPrediction, yachtCandidateVersion, type ChallengerPrediction, type CandidateKind } from "../../prediction.ts";
import { predictIntelLogReg, type LogRegIntelArtifact } from "../../models/logreg.ts";
import { predictGbt, type GbtArtifact } from "../../models/gbt.ts";
import { predictMarketBaseline } from "../../models/market-baseline.ts";
import { applyCalibrator, type Calibrator } from "../../calibration.ts";
import { mlbFeatureVector } from "./vector.ts";

export const MLB_CHAMPION = "v2-mlb";

export type MlbChallengerArtifacts = {
  logreg?: LogRegIntelArtifact;
  gbt?: GbtArtifact;
  calibrator?: Calibrator;
};

const HIGH_UNCERTAINTY = 0.42;
const LOW_QUALITY = 0.35;

function stance(uncertainty: number, dataQuality: number, missingCritical: string[]): {
  researchStance: "PASS" | "CONSIDER";
  passReasons: string[];
} {
  const passReasons: string[] = [];
  if (dataQuality < LOW_QUALITY) passReasons.push("data_quality_low");
  if (uncertainty >= HIGH_UNCERTAINTY) passReasons.push("uncertainty_high");
  if (missingCritical.includes("open_no_vig_home")) passReasons.push("unproven_market");
  if (missingCritical.includes("starting_pitcher_era")) passReasons.push("starter_unproven");
  return {
    researchStance: passReasons.length ? "PASS" : "CONSIDER",
    passReasons,
  };
}

/**
 * Independent MLB challenger. Does not modify v2-mlb.
 * Outputs shadow probabilities only. BET/PASS production policy stays outside.
 */
export function predictMlbChallenger(input: {
  snapshot: YachtSnapshot;
  kind: CandidateKind;
  artifacts?: MlbChallengerArtifacts;
}): ChallengerPrediction {
  const { snapshot, kind } = input;
  if (snapshot.sport !== "mlb" && snapshot.league !== "mlb") {
    throw new Error("MLB challenger only accepts MLB snapshots");
  }
  const version = yachtCandidateVersion("mlb", kind);
  if (canQueueOfficial(version)) throw new Error("MLB challenger must remain unofficial");

  const vec = mlbFeatureVector(snapshot.features, snapshot.market, snapshot.predictionAt);
  const baseline = marketBaseline(snapshot.market, snapshot.predictionAt);
  const marketProbability = predictMarketBaseline(baseline);

  let raw: number;
  if (kind === "market") {
    if (marketProbability == null) {
      const s = stance(1, 0, ["open_no_vig_home"]);
      return challengerPrediction({
        sport: "mlb",
        gameId: snapshot.gameId,
        league: snapshot.league,
        startAt: snapshot.startAt,
        modelVersion: version,
        candidateKind: "market",
        predictionAt: snapshot.predictionAt,
        featureSnapshotId: snapshot.snapshotId,
        probability: 0.5,
        uncertainty: 1,
        dataQuality: 0,
        marketProbability: null,
        researchStance: "PASS",
        passReasons: s.passReasons,
        lifecycle: "SHADOW",
      });
    }
    raw = marketProbability;
  } else if (kind === "gbt") {
    if (!input.artifacts?.gbt) throw new Error("GBT artifact missing — challenger cannot invent coefficients");
    raw = predictGbt(vec.values, input.artifacts.gbt);
  } else {
    if (!input.artifacts?.logreg) throw new Error("logreg artifact missing — challenger cannot invent coefficients");
    raw = predictIntelLogReg(vec.values, input.artifacts.logreg);
  }

  const probability = applyCalibrator(raw, input.artifacts?.calibrator ?? { method: "none" });
  const { researchStance, passReasons } = stance(vec.uncertainty, vec.dataQuality, vec.missingCritical);

  return challengerPrediction({
    sport: "mlb",
    gameId: snapshot.gameId,
    league: snapshot.league,
    startAt: snapshot.startAt,
    modelVersion: version,
    candidateKind: kind,
    predictionAt: snapshot.predictionAt,
    featureSnapshotId: snapshot.snapshotId,
    probability,
    uncertainty: vec.uncertainty,
    dataQuality: vec.dataQuality,
    marketProbability,
    researchStance,
    passReasons,
    lifecycle: "SHADOW",
  });
}

export function mlbChallengerCannotPostOfficial(): boolean {
  return !canQueueOfficial(yachtCandidateVersion("mlb", "logreg")) && MLB_CHAMPION === "v2-mlb";
}
