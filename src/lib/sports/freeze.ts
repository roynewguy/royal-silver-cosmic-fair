import type { OddsSnapshot, RankPick } from "./types.ts";
import type { FieldFreshness } from "./freshness.ts";
import { SOURCE_HIERARCHY } from "./source-hierarchy.ts";

export type AuditField = {
  field: string;
  value: string;
  source: string;
  capturedAt: string | null;
};

export type FreezeSnapshot = {
  frozenAt: string;
  gameStatus?: string;
  starters?: { home: unknown; away: unknown };
  rawMarketProbability?: number | null;
  sourceFetchedAt?: string | null;
  modelVersion: string;
  modelProbability: number;
  modelEdge: number;
  confidence: number;
  units: number;
  market: string;
  side: string;
  selection: string;
  lockedOdds: number;
  lockedLine: number | null;
  gameId: string;
  odds: OddsSnapshot;
  homeTeam?: string;
  awayTeam?: string;
  startAt?: string;
  league?: string;
  dkCapturedAt?: string | null;
  marketProbability?: number | null;
  dataQuality?: number | null;
  postingToken?: string | null;
  llmFacts?: false;
  audit?: AuditField[];
  freshness?: Record<string, FieldFreshness>;
};

export function buildFreezeSnapshot(input: {
  rank: RankPick;
  units: number;
  lockedOdds: number;
  lockedLine: number | null;
  selection: string;
  gameId: string;
  odds: OddsSnapshot;
  frozenAt?: string;
  gameStatus?: string;
  starters?: { home: unknown; away: unknown };
  rawMarketProbability?: number | null;
  sourceFetchedAt?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  startAt?: string;
  league?: string;
  marketProbability?: number | null;
  postingToken?: string | null;
  freshness?: Record<string, FieldFreshness>;
}): FreezeSnapshot {
  const frozenAt = input.frozenAt ?? new Date().toISOString();
  const dkCapturedAt = input.odds.capturedAt;
  const audit: AuditField[] = [
    { field: "gameId", value: input.gameId, source: SOURCE_HIERARCHY.schedule, capturedAt: input.sourceFetchedAt ?? null },
    { field: "startAt", value: input.startAt ?? "", source: SOURCE_HIERARCHY.schedule, capturedAt: input.sourceFetchedAt ?? null },
    { field: "home", value: input.homeTeam ?? "", source: SOURCE_HIERARCHY.teams, capturedAt: input.sourceFetchedAt ?? null },
    { field: "away", value: input.awayTeam ?? "", source: SOURCE_HIERARCHY.teams, capturedAt: input.sourceFetchedAt ?? null },
    { field: "price", value: String(input.lockedOdds), source: SOURCE_HIERARCHY.officialPrice, capturedAt: dkCapturedAt },
    { field: "modelVersion", value: input.rank.model, source: SOURCE_HIERARCHY.probability, capturedAt: frozenAt },
    { field: "probability", value: String(input.rank.probability), source: SOURCE_HIERARCHY.probability, capturedAt: frozenAt },
  ];
  return {
    frozenAt,
    gameStatus: input.gameStatus,
    starters: input.starters,
    rawMarketProbability: input.rawMarketProbability,
    sourceFetchedAt: input.sourceFetchedAt,
    modelVersion: input.rank.model,
    modelProbability: input.rank.probability,
    modelEdge: input.rank.edgePct,
    confidence: input.rank.confidence,
    units: input.units,
    market: input.rank.market,
    side: input.rank.side,
    selection: input.selection,
    lockedOdds: input.lockedOdds,
    lockedLine: input.lockedLine,
    gameId: input.gameId,
    odds: input.odds,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    startAt: input.startAt,
    league: input.league,
    dkCapturedAt,
    marketProbability: input.marketProbability ?? input.rank.noVigImplied ?? null,
    dataQuality: input.rank.dataQuality ?? null,
    postingToken: input.postingToken ?? null,
    llmFacts: false,
    audit,
    freshness: input.freshness,
  };
}
