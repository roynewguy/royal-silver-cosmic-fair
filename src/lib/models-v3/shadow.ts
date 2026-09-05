import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseWinPct } from "../sports/odds.ts";
import type { GameCard } from "../sports/types.ts";
import { applyStandard, clampProb, predictLogReg } from "./logreg.ts";
import { canQueueOfficial } from "./registry.ts";
import type { LogRegArtifact } from "./types.ts";

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

export function liveFeatureVector(game: GameCard): number[] | null {
  const hw = parseWinPct(game.home.record);
  const aw = parseWinPct(game.away.record);
  if (hw == null || aw == null) return null;
  const eraH = game.home.starter?.era;
  const eraA = game.away.starter?.era;
  const missing = eraH == null || eraA == null ? 1 : 0;
  return [1, hw - aw, 0, 0, 0, 0, missing ? 0 : (eraA ?? 0) - (eraH ?? 0), missing];
}

export function shadowPredict(game: GameCard, artifact: LogRegArtifact): {
  modelVersion: string;
  probability: number;
  official: false;
} | null {
  if (canQueueOfficial(artifact.modelVersion)) return null;
  const x = liveFeatureVector(game);
  if (!x) return null;
  const p = clampProb(predictLogReg(applyStandard(x, artifact.means, artifact.stds), artifact.weights));
  return { modelVersion: artifact.modelVersion, probability: p, official: false };
}

export function shadowPredictMlb(game: GameCard, artifact: LogRegArtifact) {
  if (game.league !== "mlb") return null;
  return shadowPredict(game, artifact);
}
