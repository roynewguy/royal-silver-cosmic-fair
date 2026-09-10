import type { GameCard } from "../sports/types.ts";
import { buildYachtSnapshot, historicalPredictionAt, yachtPredictionAt, type YachtSnapshot } from "./core/snapshot.ts";
import { yachtProvider } from "./provider.ts";
import { liveMarketSnapshot } from "./shared.ts";
import "./adapters.ts";

export { historicalPredictionAt, yachtPredictionAt };

export type YachtLiveSnapshot = YachtSnapshot;

export function buildYachtLiveSnapshot(game: GameCard, now = Date.now()): YachtLiveSnapshot | null {
  const provider = yachtProvider(game.league);
  if (!provider) return null;
  const predictionAt = yachtPredictionAt(game.startAt, now);
  if (!predictionAt) return null;
  const features = provider.liveFeatures({ game, predictionAt });
  const market = liveMarketSnapshot(game);
  return buildYachtSnapshot({
    gameId: game.id,
    sport: provider.sport,
    league: game.league,
    modelVersion: provider.contractVersion,
    predictionAt,
    startAt: game.startAt,
    features,
    market,
  });
}
