import { canQueueOfficial } from "../../../../models-v3/registry.ts";
import type { YachtSnapshot } from "../../../core/snapshot.ts";
import { marketBaseline } from "../../market.ts";
import {
  challengerPrediction,
  yachtCandidateVersion,
  type ChallengerPrediction,
  type CandidateKind,
} from "../../prediction.ts";
import { predictIntelLogReg, type LogRegIntelArtifact } from "../../models/logreg.ts";
import { predictGbt, type GbtArtifact } from "../../models/gbt.ts";
import { predictMarketBaseline } from "../../models/market-baseline.ts";
import { applyCalibrator, type Calibrator } from "../../calibration.ts";
import { NFL_FEATURE_SCHEMA_VERSION, nflFeatureVector } from "./vector.ts";

export const NFL_CHAMPION = "v2-nfl";
export const NFL_YACHT_STAMP = "2026.09.2";

export type NflChallengerArtifacts = {
  schemaVersion: typeof NFL_FEATURE_SCHEMA_VERSION;
  featureNames: string[];
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
  if (missingCritical.includes("qb_status")) passReasons.push("qb_unproven");
  return {
    researchStance: passReasons.length ? "PASS" : "CONSIDER",
    passReasons,
  };
}

function assertArtifacts(kind: CandidateKind, artifacts?: NflChallengerArtifacts): void {
  if (kind === "market") return;
  if (!artifacts) throw new Error("NFL artifact missing — challenger cannot invent coefficients");
  if (artifacts.schemaVersion !== NFL_FEATURE_SCHEMA_VERSION) {
    throw new Error("NFL artifact schema mismatch — fail closed");
  }
}

/**
 * Independent NFL challenger. Does not modify v2-nfl.
 * Outputs shadow probabilities only. BET/PASS production policy stays outside.
 */
export function predictNflChallenger(input: {
  snapshot: YachtSnapshot;
  kind: CandidateKind;
  artifacts?: NflChallengerArtifacts;
}): ChallengerPrediction {
  const { snapshot, kind } = input;
  if (snapshot.sport !== "nfl" && snapshot.league !== "nfl") {
    throw new Error("NFL challenger only accepts NFL snapshots");
  }
  const version = yachtCandidateVersion("nfl", kind, NFL_YACHT_STAMP);
  if (canQueueOfficial(version)) throw new Error("NFL challenger must remain unofficial");

  const vec = nflFeatureVector(snapshot.features, snapshot.market, snapshot.predictionAt, snapshot.startAt);
  const baseline = marketBaseline(snapshot.market, snapshot.predictionAt);
  const marketProbability = predictMarketBaseline(baseline);

  assertArtifacts(kind, input.artifacts);
  if (kind !== "market" && input.artifacts && input.artifacts.featureNames.length !== vec.values.length) {
    throw new Error("NFL artifact/schema mismatch — fail closed");
  }

  let raw: number;
  if (kind === "market") {
    if (marketProbability == null) {
      const s = stance(1, 0, ["open_no_vig_home"]);
      return challengerPrediction({
        sport: "nfl",
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

  if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
    throw new Error("NFL challenger probability outside valid range — fail closed");
  }

  const probability = applyCalibrator(raw, input.artifacts?.calibrator ?? { method: "none" });
  const { researchStance, passReasons } = stance(vec.uncertainty, vec.dataQuality, vec.missingCritical);

  return challengerPrediction({
    sport: "nfl",
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

export function nflChallengerCannotPostOfficial(): boolean {
  return !canQueueOfficial(yachtCandidateVersion("nfl", "logreg", NFL_YACHT_STAMP)) && NFL_CHAMPION === "v2-nfl";
}

export function nflYachtVersion(kind: CandidateKind): string {
  return yachtCandidateVersion("nfl", kind, NFL_YACHT_STAMP);
}
