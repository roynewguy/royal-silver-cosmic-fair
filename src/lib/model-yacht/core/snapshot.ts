import { createHash } from "node:crypto";
import { CANONICAL_LEAD_MS } from "../../models-v3/integrity.ts";
import { validateSnapshotProvenance, type YachtFeature, type YachtMarketSnapshot } from "./provenance.ts";

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

export type SnapshotIdInput = {
  sport: string;
  modelVersion: string;
  gameId: string;
  predictionAt: string;
  marketFingerprint?: string | number | null;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Sport-neutral snapshot id. The caller supplies sport + modelVersion.
 * This file must never import an MLB contract.
 */
export function snapshotIdFrom(input: SnapshotIdInput): string {
  const h = createHash("sha256");
  h.update(input.sport);
  h.update("\n");
  h.update(input.modelVersion);
  h.update("\n");
  h.update(input.gameId);
  h.update("\n");
  h.update(input.predictionAt);
  h.update("\n");
  h.update(String(input.marketFingerprint ?? ""));
  return `yacht_${h.digest("hex").slice(0, 24)}`;
}

export function marketFingerprint(market: Pick<YachtMarketSnapshot, "openCapturedAt" | "capturedAt" | "homeOpen" | "awayOpen" | "homeCurrent" | "awayCurrent">): string {
  return [market.openCapturedAt, market.capturedAt, market.homeOpen, market.awayOpen, market.homeCurrent, market.awayCurrent].join("|");
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
 *  2. INSERT yacht_dataset_rows / yacht_shadow_predictions with snapshot_id FK
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
  const provenanceOk = validateSnapshotProvenance(input);
  const snapshotId = snapshotIdFrom({
    sport: input.sport,
    modelVersion: input.modelVersion,
    gameId: input.gameId,
    predictionAt: input.predictionAt,
    marketFingerprint: marketFingerprint(input.market),
  });
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
