import { createHash } from "node:crypto";
import { CANONICAL_LEAD_MS } from "../../models-v3/integrity.ts";
import { snapshotProvenanceOk, type YachtFeature, type YachtMarketSnapshot } from "./provenance.ts";

export type YachtSnapshot = {
  snapshotId: string;
  gameId: string;
  sport: string;
  league: string;
  modelVersion: string;
  predictionAt: string;
  startAt: string;
  features: YachtFeature[];
  market: YachtMarketSnapshot;
  missing: string[];
  dataQuality: number;
  provenanceOk: boolean;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Sport-neutral snapshot id. Caller supplies modelVersion — never a hardcoded MLB contract. */
export function snapshotIdFrom(modelVersion: string, parts: Array<string | number | null | undefined>): string {
  const h = createHash("sha256");
  h.update(modelVersion);
  h.update("\n");
  for (const p of parts) {
    h.update(String(p ?? ""));
    h.update("\0");
  }
  return `yacht_${h.digest("hex").slice(0, 24)}`;
}

export function yachtPredictionAt(startAt: string, now = Date.now(), _leadMs = CANONICAL_LEAD_MS): string | null {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start) || now >= start) return null;
  return iso(now);
}

export function historicalPredictionAt(startAt: string, leadMs = CANONICAL_LEAD_MS): string | null {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start)) return null;
  const at = start - leadMs;
  if (at >= start) return null;
  return iso(at);
}

/**
 * Persistence order when writing to Postgres:
 *  1. INSERT yacht_feature_snapshots (row is frozen by trigger; no UPDATE/DELETE)
 *  2. INSERT yacht_dataset_rows with snapshot_id FK
 * In-memory dataset generation does not require DB and may exist without a snapshot row.
 */
export function buildYachtSnapshot(input: {
  gameId: string;
  sport: string;
  league: string;
  modelVersion: string;
  predictionAt: string;
  startAt: string;
  features: YachtFeature[];
  market: YachtMarketSnapshot;
}): YachtSnapshot {
  const usable = input.features.filter((f) => f.usable).length;
  const provenanceOk = snapshotProvenanceOk(input);
  const snapshotId = snapshotIdFrom(input.modelVersion, [
    input.sport,
    input.gameId,
    input.predictionAt,
    input.market.openCapturedAt,
    input.market.capturedAt,
    input.market.homeOpen,
    input.market.awayOpen,
    input.market.homeCurrent,
    input.market.awayCurrent,
  ]);
  return {
    snapshotId,
    gameId: input.gameId,
    sport: input.sport,
    league: input.league,
    modelVersion: input.modelVersion,
    predictionAt: input.predictionAt,
    startAt: input.startAt,
    features: input.features,
    market: input.market,
    missing: input.features.filter((f) => f.missing).map((f) => f.key),
    dataQuality: Math.max(0, Math.min(1, usable / Math.max(input.features.length, 1))),
    provenanceOk,
  };
}
