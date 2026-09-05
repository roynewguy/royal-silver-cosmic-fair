export { FEATURE_NAMES as MLB_FEATURE_NAMES, featureVector, teamFeatures } from "../features.ts";
import { buildRows } from "../features.ts";
import type { HistoricalGame, HistoricalOdds, StarterFeat, TrainingRow } from "../types.ts";

export function buildMlbRows(
  games: HistoricalGame[],
  odds: HistoricalOdds[],
  starters: Record<string, { home: StarterFeat; away: StarterFeat }>,
): { rows: TrainingRow[]; dropped: number } {
  return buildRows(games, odds, starters, 10);
}
