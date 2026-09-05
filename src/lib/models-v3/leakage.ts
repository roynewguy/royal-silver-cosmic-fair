import type { HistoricalGame } from "./types.ts";

export function isStrictlyBefore(featureTime: string, gameStart: string): boolean {
  return new Date(featureTime).getTime() < new Date(gameStart).getTime();
}

export function priorGames(all: HistoricalGame[], teamAbbr: string, beforeIso: string): HistoricalGame[] {
  const t = new Date(beforeIso).getTime();
  return all.filter((g) => {
    if (g.homeAbbr !== teamAbbr && g.awayAbbr !== teamAbbr) return false;
    if (g.status !== "final" || g.homeScore == null || g.awayScore == null) return false;
    return new Date(g.startAt).getTime() < t;
  });
}

export function assertNoFutureGames(priors: HistoricalGame[], gameStart: string): void {
  const t = new Date(gameStart).getTime();
  for (const g of priors) {
    if (new Date(g.startAt).getTime() >= t) {
      throw new Error(`leak: prior game ${g.gameId} is not before ${gameStart}`);
    }
  }
}

export function rowUsesScoresAsFeatures(featuresJson: string): boolean {
  return /homeScore|awayScore|"score"/.test(featuresJson);
}
