import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PRODUCTION_MODELS } from "./registry.ts";
import { officialResearchSports } from "./sports.ts";
import { loadShadowCompare } from "./compare.ts";
import { BACKTEST_AUDIT } from "./integrity.ts";
import type { LogRegArtifact } from "./types.ts";

export type SportResearch = {
  league: string;
  production: string;
  shadow: string | null;
  testN: number | null;
  brier: number | null;
  logLoss: number | null;
  roi: number | null;
};

export async function loadResearchSummary(): Promise<{
  production: string;
  shadow: string | null;
  testN: number | null;
  brier: number | null;
  logLoss: number | null;
  roi: number | null;
  note: string;
  sports: SportResearch[];
  shadowCompare?: Awaited<ReturnType<typeof loadShadowCompare>>;
  audit?: string[];
} | null> {
  const dir = "src/lib/models-v3/artifacts";
  const sports: SportResearch[] = [];
  for (const spec of officialResearchSports()) {
    let art: LogRegArtifact | null = null;
    try {
      art = JSON.parse(await readFile(join(dir, spec.id, "latest.json"), "utf8")) as LogRegArtifact;
    } catch {
      if (spec.id === "mlb") {
        try {
          art = JSON.parse(await readFile(join(dir, "latest.json"), "utf8")) as LogRegArtifact;
        } catch {
          art = null;
        }
      }
    }
    const test = art?.metrics.test as { n?: number; brier?: number; logLoss?: number; backtest?: { edge3?: { roi?: number | null } } } | undefined;
    sports.push({
      league: spec.id.toUpperCase(),
      production: spec.production,
      shadow: art?.modelVersion ?? null,
      testN: test?.n ?? null,
      brier: test?.brier ?? null,
      logLoss: test?.logLoss ?? null,
      roi: test?.backtest?.edge3?.roi ?? null,
    });
  }
  const mlb = sports.find((s) => s.league === "MLB");
  const shadowCompare = await loadShadowCompare("mlb");
  return {
    production: mlb?.production ?? PRODUCTION_MODELS.mlb,
    shadow: mlb?.shadow ?? null,
    testN: mlb?.testN ?? null,
    brier: mlb?.brier ?? null,
    logLoss: mlb?.logLoss ?? null,
    roi: mlb?.roi ?? null,
    note: "Research only. Backtests are not a live record and never auto-promote.",
    sports,
    shadowCompare,
    audit: [
      BACKTEST_AUDIT.sportsbook,
      BACKTEST_AUDIT.priceUsedForStake,
      BACKTEST_AUDIT.vig,
      BACKTEST_AUDIT.starterEra,
      BACKTEST_AUDIT.honestRule,
    ],
  };
}
