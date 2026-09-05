import { readFile } from "node:fs/promises";
import { PRODUCTION_MODELS } from "./registry.ts";
import type { LogRegArtifact } from "./types.ts";

export async function loadResearchSummary(): Promise<{
  production: string;
  shadow: string | null;
  testN: number | null;
  brier: number | null;
  logLoss: number | null;
  roi: number | null;
  note: string;
} | null> {
  try {
    const art = JSON.parse(await readFile("src/lib/models-v3/artifacts/latest.json", "utf8")) as LogRegArtifact;
    const test = art.metrics.test as { n?: number; brier?: number; logLoss?: number; backtest?: { edge3?: { roi?: number | null } } };
    return {
      production: PRODUCTION_MODELS.mlb,
      shadow: art.modelVersion,
      testN: test?.n ?? null,
      brier: test?.brier ?? null,
      logLoss: test?.logLoss ?? null,
      roi: test?.backtest?.edge3?.roi ?? null,
      note: "Research only. Not shown to customers as a live record.",
    };
  } catch {
    return {
      production: PRODUCTION_MODELS.mlb,
      shadow: null,
      testN: null,
      brier: null,
      logLoss: null,
      roi: null,
      note: "No V3 artifact yet. Run dataset:mlb then train:mlb.",
    };
  }
}
