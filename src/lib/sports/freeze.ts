import type { OddsSnapshot, RankPick } from "./types.ts";

export type FreezeSnapshot = {
  frozenAt: string;
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
}): FreezeSnapshot {
  return {
    frozenAt: input.frozenAt ?? new Date().toISOString(),
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
  };
}
