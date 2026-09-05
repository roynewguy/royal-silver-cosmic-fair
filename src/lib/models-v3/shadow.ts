import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { impliedFromAmerican } from "../sports/odds.ts";
import type { GameCard } from "../sports/types.ts";
import { applyStandard, clampProb, predictLogReg } from "./logreg.ts";
import { canQueueOfficial } from "./registry.ts";
import { buildLiveTrainingRow } from "./live-features.ts";
import type { HistoricalGame, LogRegArtifact, TrainingRow } from "./types.ts";

let cached: Map<string, LogRegArtifact> | null = null;

export async function loadShadowArtifacts(dir = "src/lib/models-v3/artifacts"): Promise<Map<string, LogRegArtifact>> {
  if (cached) return cached;
  const map = new Map<string, LogRegArtifact>();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const art = JSON.parse(await readFile(join(dir, e.name, "latest.json"), "utf8")) as LogRegArtifact;
        if (!canQueueOfficial(art.modelVersion)) map.set(e.name, art);
      } catch {
        /* missing sport artifact */
      }
    }
    if (!map.has("mlb")) {
      try {
        const art = JSON.parse(await readFile(join(dir, "latest.json"), "utf8")) as LogRegArtifact;
        if (!canQueueOfficial(art.modelVersion)) map.set("mlb", art);
      } catch {
        /* none */
      }
    }
  } catch {
    /* no artifacts dir */
  }
  cached = map;
  return map;
}

/** @deprecated live zeros are forbidden. Use buildLiveTrainingRow. */
export function liveFeatureVector(_game: GameCard): number[] | null {
  return null;
}

export type ShadowCall = {
  modelVersion: string;
  probability: number;
  official: false;
  vector: number[];
  row: TrainingRow;
  marketProbability: number | null;
  estimatedEdge: number | null;
  marketPrice: number | null;
  featuresJson: string;
};

export function shadowPredict(
  game: GameCard,
  artifact: LogRegArtifact,
  history: HistoricalGame[],
  now = Date.now(),
): ShadowCall | null {
  if (canQueueOfficial(artifact.modelVersion)) return null;
  const built = buildLiveTrainingRow(game, history, now);
  if (!built.ok) return null;
  const p = clampProb(predictLogReg(applyStandard(built.vector, artifact.means, artifact.stds), artifact.weights));
  const marketPrice = game.odds.homeMl;
  const marketProbability = marketPrice != null ? impliedFromAmerican(marketPrice) : null;
  return {
    modelVersion: artifact.modelVersion,
    probability: p,
    official: false,
    vector: built.vector,
    row: built.row,
    marketProbability,
    estimatedEdge: marketProbability != null ? p - marketProbability : null,
    marketPrice,
    featuresJson: JSON.stringify({
      knownBeforeStart: true,
      missing: built.missing,
      names: artifact.featureNames,
      vector: built.vector,
      home: built.row.features.home,
      away: built.row.features.away,
      homeStarter: built.row.features.homeStarter,
      awayStarter: built.row.features.awayStarter,
    }),
  };
}

export function shadowPredictMlb(game: GameCard, artifact: LogRegArtifact, history: HistoricalGame[] = []) {
  if (game.league !== "mlb") return null;
  return shadowPredict(game, artifact, history);
}
