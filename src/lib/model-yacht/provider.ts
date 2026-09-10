import type { HistoricalGame, TeamFeat } from "../models-v3/types.ts";
import type { GameCard } from "../sports/types.ts";
import type { YachtDataSourceRow } from "./data-matrix.ts";
import type { YachtFeature, YachtMarketSnapshot } from "./provenance.ts";
import type { YachtSport } from "./sports.ts";

export type YachtHistContext = {
  game: HistoricalGame;
  predictionAt: string;
  homeForm: TeamFeat | null;
  awayForm: TeamFeat | null;
  lastHomeAt: string | null;
  lastAwayAt: string | null;
  priorCompleteMs: number;
  pregame: YachtMarketSnapshot;
};

export type YachtLiveContext = {
  game: GameCard;
  predictionAt: string;
};

export type SportFeatureProvider = {
  sport: YachtSport;
  displayName: string;
  family: "team-game" | "fight";
  minPrior: number;
  priorCompleteMs: number;
  contractVersion: string;
  datasetName: string;
  notes: string[];
  matrix: YachtDataSourceRow[];
  historicalFeatures(ctx: YachtHistContext): YachtFeature[];
  liveFeatures(ctx: YachtLiveContext): YachtFeature[];
};

const registry = new Map<YachtSport, SportFeatureProvider>();

export function registerYachtProvider(provider: SportFeatureProvider): void {
  registry.set(provider.sport, provider);
}

export function yachtProvider(sport: string): SportFeatureProvider | null {
  return registry.get(sport as YachtSport) ?? null;
}

export function yachtProviders(): SportFeatureProvider[] {
  return [...registry.values()];
}
