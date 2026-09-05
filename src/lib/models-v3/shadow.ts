import { readFile } from "node:fs/promises";
import { parseWinPct } from "../sports/odds.ts";
import type { GameCard } from "../sports/types.ts";
import { applyStandard, clampProb, predictLogReg } from "./logreg.ts";
import { canQueueOfficial } from "./registry.ts";
import type { LogRegArtifact } from "./types.ts";

let cached: LogRegArtifact | null | undefined;

export async function loadShadowArtifact(path = "src/lib/models-v3/artifacts/latest.json"): Promise<LogRegArtifact | null> {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(await readFile(path, "utf8")) as LogRegArtifact;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function liveFeatureVector(game: GameCard): number[] | null {
  const hw = parseWinPct(game.home.record);
  const aw = parseWinPct(game.away.record);
  if (hw == null || aw == null) return null;
  const eraH = game.home.starter?.era;
  const eraA = game.away.starter?.era;
  const missing = eraH == null || eraA == null ? 1 : 0;
  return [1, hw - aw, 0, 0, 0, 0, missing ? 0 : (eraA ?? 0) - (eraH ?? 0), missing];
}

export function shadowPredictMlb(game: GameCard, artifact: LogRegArtifact): {
  modelVersion: string;
  probability: number;
  official: false;
} | null {
  if (game.league !== "mlb") return null;
  if (canQueueOfficial(artifact.modelVersion)) return null;
  const x = liveFeatureVector(game);
  if (!x) return null;
  const p = clampProb(predictLogReg(applyStandard(x, artifact.means, artifact.stds), artifact.weights));
  return { modelVersion: artifact.modelVersion, probability: p, official: false };
}
