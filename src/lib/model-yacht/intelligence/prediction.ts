import { yachtPrediction } from "../core/output.ts";
import { isYachtSport, sportFromYachtVersion, type YachtSport } from "../core/versioning.ts";
import type { ModelLifecycle } from "./lifecycle.ts";

export const CANDIDATE_KINDS = ["logreg", "gbt", "market"] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export function isCandidateKind(v: string): v is CandidateKind {
  return (CANDIDATE_KINDS as readonly string[]).includes(v);
}

export type ResearchStance = "PASS" | "CONSIDER";

/**
 * Shadow-only challenger prediction. BET/PASS production policy stays outside.
 * CONSIDER is research-only and cannot queue official tickets.
 */
export type ChallengerPrediction = {
  sport: YachtSport;
  gameId: string;
  league: string;
  startAt: string;
  modelVersion: string;
  candidateKind: CandidateKind;
  predictionAt: string;
  featureSnapshotId: string;
  probability: number;
  uncertainty: number;
  dataQuality: number;
  marketProbability: number | null;
  modelVsMarket: number | null;
  result: 0 | 1 | null;
  closingLine: number | null;
  clv: number | null;
  official: false;
  lifecycle: ModelLifecycle;
  researchStance: ResearchStance;
  passReasons: string[];
};

export function yachtCandidateVersion(sport: string, kind: CandidateKind, stamp?: string): string {
  const id = sport.trim().toLowerCase();
  const s = stamp ?? "2026.09.1";
  if (!isYachtSport(id)) throw new Error(`unknown yacht sport ${sport}`);
  if (!isCandidateKind(kind)) throw new Error(`unknown candidate kind ${kind}`);
  return `model-yacht-${id}-${kind}-${s}`;
}

export function candidateKindFromVersion(version: string): CandidateKind | null {
  const m = /^model-yacht-[a-z0-9]+-(logreg|gbt|market)-/i.exec(version.trim());
  return m ? (m[1].toLowerCase() as CandidateKind) : null;
}

export function challengerPrediction(input: {
  sport: string;
  gameId: string;
  league: string;
  startAt: string;
  modelVersion: string;
  candidateKind: CandidateKind;
  predictionAt: string;
  featureSnapshotId: string;
  probability: number;
  uncertainty: number;
  dataQuality: number;
  marketProbability: number | null;
  modelVsMarket?: number | null;
  result?: 0 | 1 | null;
  closingLine?: number | null;
  clv?: number | null;
  official?: boolean;
  lifecycle?: ModelLifecycle;
  researchStance?: ResearchStance;
  passReasons?: string[];
}): ChallengerPrediction {
  if (input.official === true) throw new Error("challenger prediction cannot be official");
  const core = yachtPrediction({
    sport: input.sport,
    modelVersion: input.modelVersion,
    probability: input.probability,
    uncertainty: input.uncertainty,
    dataQuality: input.dataQuality,
    predictionAt: input.predictionAt,
    featureSnapshotId: input.featureSnapshotId,
    official: false,
  });
  if (input.marketProbability != null && (input.marketProbability < 0 || input.marketProbability > 1)) {
    throw new Error("marketProbability must be between 0 and 1");
  }
  if (sportFromYachtVersion(input.modelVersion) !== input.sport) {
    throw new Error("challenger sport/model mismatch");
  }
  const kind = candidateKindFromVersion(input.modelVersion) ?? input.candidateKind;
  if (kind !== input.candidateKind) {
    throw new Error("challenger candidate kind/model mismatch");
  }
  const marketProbability = input.marketProbability;
  const modelVsMarket =
    input.modelVsMarket ?? (marketProbability != null ? input.probability - marketProbability : null);
  return {
    sport: core.sport,
    gameId: input.gameId,
    league: input.league,
    startAt: input.startAt,
    modelVersion: core.modelVersion,
    candidateKind: input.candidateKind,
    predictionAt: core.predictionAt,
    featureSnapshotId: core.featureSnapshotId,
    probability: core.probability,
    uncertainty: core.uncertainty,
    dataQuality: core.dataQuality,
    marketProbability,
    modelVsMarket,
    result: input.result ?? null,
    closingLine: input.closingLine ?? null,
    clv: input.clv ?? null,
    official: false,
    lifecycle: input.lifecycle ?? "SHADOW",
    researchStance: input.researchStance ?? "PASS",
    passReasons: input.passReasons ?? [],
  };
}
