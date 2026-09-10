import { canQueueOfficial } from "../../models-v3/registry.ts";
import { YACHT_SPORTS, type YachtSport } from "../core/versioning.ts";
import type { YachtSnapshot } from "../core/snapshot.ts";
import { featureContract, type SportFeatureContract } from "./features/index.ts";
import type { ChallengerPrediction, CandidateKind } from "./prediction.ts";
import type { ModelLifecycle } from "./lifecycle.ts";
import { soccerLifecycle, soccerMayPostOfficial, isSoccerSport } from "./soccer.ts";
import { predictMlbChallenger, type MlbChallengerArtifacts } from "./sports/mlb/engine.ts";
import { predictNflChallenger, type NflChallengerArtifacts } from "./sports/nfl/engine.ts";

export type ChallengerArtifacts = MlbChallengerArtifacts & Partial<NflChallengerArtifacts>;

export type SportChallengerEngine = {
  sport: YachtSport;
  championVersion: string;
  lifecycle: ModelLifecycle;
  contract: SportFeatureContract;
  candidates: CandidateKind[];
  official: false;
  predict(input: { snapshot: YachtSnapshot; kind: CandidateKind; artifacts?: ChallengerArtifacts }): ChallengerPrediction;
};

const CHAMPIONS: Record<YachtSport, string> = {
  mlb: "v2-mlb",
  nfl: "v2-nfl",
  ncaaf: "v2-ncaaf",
  nba: "v2-nba",
  wnba: "v2-wnba",
  nhl: "v2-nhl",
  ncaab: "v2-ncaab",
  ufc: "v2-ufc",
};

const DEEP: YachtSport[] = ["mlb", "nfl"];

function engineFor(sport: YachtSport): SportChallengerEngine {
  const deep = DEEP.includes(sport);
  return {
    sport,
    championVersion: CHAMPIONS[sport],
    lifecycle: deep ? "SHADOW" : "DATA_COLLECTION",
    contract: featureContract(sport),
    candidates: ["logreg", "gbt", "market"],
    official: false,
    predict(input) {
      if (sport === "mlb") return predictMlbChallenger(input);
      if (sport === "nfl") {
        return predictNflChallenger({
          snapshot: input.snapshot,
          kind: input.kind,
          artifacts: input.artifacts?.schemaVersion
            ? (input.artifacts as NflChallengerArtifacts)
            : undefined,
        });
      }
      throw new Error(`${sport} challenger is DATA_COLLECTION only. Deep engines are MLB then NFL.`);
    },
  };
}

const ENGINES = Object.fromEntries(YACHT_SPORTS.map((s) => [s, engineFor(s)])) as Record<YachtSport, SportChallengerEngine>;

export function challengerEngine(sport: string): SportChallengerEngine | null {
  if (isSoccerSport(sport)) return null;
  return ENGINES[sport as YachtSport] ?? null;
}

export function allChallengerEngines(): SportChallengerEngine[] {
  return YACHT_SPORTS.map((s) => ENGINES[s]);
}

export function challengerMayPostOfficial(version: string): false {
  if (canQueueOfficial(version)) {
    throw new Error("challenger version leaked into official queue");
  }
  return false;
}

export function soccerChallengerBlocked(sport: string): boolean {
  return isSoccerSport(sport) && soccerLifecycle() === "BLOCKED" && soccerMayPostOfficial(sport as "mls") === false;
}
