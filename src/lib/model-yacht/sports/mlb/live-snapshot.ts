import { mlbShadowFeatures } from "../../../models-v3/mlb-shadow-features.ts";
import { packModelInputs } from "../../../sports/model-inputs.ts";
import { weightedInjuryImpact } from "../../../sports/player-impact.ts";
import { buildMarketConsensus } from "../../../sports/market-consensus.ts";
import type { GameCard } from "../../../sports/types.ts";
import { makeFeature, type YachtFeature, type YachtMarketSnapshot } from "../../core/provenance.ts";
import { buildYachtSnapshot, yachtPredictionAt, type YachtSnapshot } from "../../core/snapshot.ts";
import { missingFeatures } from "./data-matrix.ts";
import { MODEL_YACHT_MLB_CONTRACT } from "./names.ts";

export type YachtLiveSnapshot = YachtSnapshot & {
  modelInputs: ReturnType<typeof packModelInputs>;
};

/** Source timestamp only. Never fall back to predictionAt / now / a different feed. */
function sourceTime(field: string | null | undefined): string | null {
  return field ?? null;
}

export function buildYachtLiveSnapshot(game: GameCard, now = Date.now()): YachtLiveSnapshot | null {
  if (game.league !== "mlb") return null;
  const predictionAt = yachtPredictionAt(game.startAt, now);
  if (!predictionAt) return null;

  const shadow = mlbShadowFeatures(game);
  const inj = weightedInjuryImpact(game);
  const consensus = game.shadows?.consensus ?? buildMarketConsensus(game.shadows?.consensus?.books ?? []);
  const inputs = packModelInputs(game);
  const oddsAt = sourceTime(game.odds.capturedAt);
  const boardAt = sourceTime(game.fetchedAt);
  const weatherAt = sourceTime(game.weatherFetchedAt);
  const starterAt = sourceTime(game.startersFetchedAt);
  const injuryAt = sourceTime(game.injuriesFetchedAt);

  const features: YachtFeature[] = [
    makeFeature({ key: "venue", value: game.venue, source: "espn-site-scoreboard", knownAt: boardAt, capturedAt: boardAt, predictionAt, quality: game.venue && boardAt ? 1 : 0 }),
    makeFeature({ key: "weather_string", value: game.weather, source: "espn-weather", knownAt: weatherAt, capturedAt: weatherAt, predictionAt, quality: game.weather && weatherAt ? 0.6 : 0 }),
    makeFeature({ key: "home_era", value: shadow.eraHome, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt, quality: starterAt ? 0.55 : 0 }),
    makeFeature({ key: "away_era", value: shadow.eraAway, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt, quality: starterAt ? 0.55 : 0 }),
    makeFeature({ key: "home_whip", value: shadow.whipHome, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt, quality: starterAt ? 0.55 : 0 }),
    makeFeature({ key: "away_whip", value: shadow.whipAway, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt, quality: starterAt ? 0.55 : 0 }),
    makeFeature({ key: "home_win_pct", value: shadow.homeWinPct, source: "espn-record", knownAt: boardAt, capturedAt: boardAt, predictionAt, quality: boardAt ? 0.7 : 0 }),
    makeFeature({ key: "away_win_pct", value: shadow.awayWinPct, source: "espn-record", knownAt: boardAt, capturedAt: boardAt, predictionAt, quality: boardAt ? 0.7 : 0 }),
    makeFeature({ key: "injury_away_minus_home", value: inj.away - inj.home, source: "espn-injury-board+player-impact", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.7 : 0 }),
    makeFeature({ key: "consensus_home", value: consensus?.noVigHome ?? null, source: "odds-api-consensus", knownAt: oddsAt, capturedAt: oddsAt, predictionAt, quality: consensus?.noVigHome != null && oddsAt ? 0.8 : 0 }),
    makeFeature({ key: "market_dispersion", value: consensus?.dispersion ?? null, source: "odds-api-consensus", knownAt: oddsAt, capturedAt: oddsAt, predictionAt, quality: consensus && consensus.books.length >= 2 && oddsAt ? 0.8 : 0 }),
  ];

  for (const name of missingFeatures()) {
    features.push(makeFeature({ key: name, value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }));
  }

  const market: YachtMarketSnapshot = {
    sportsbook: game.odds.book,
    capturedAt: oddsAt,
    openCapturedAt: null,
    closeCapturedAt: null,
    homeOpen: game.odds.openHomeMl ?? null,
    awayOpen: game.odds.openAwayMl ?? null,
    homeCurrent: game.odds.homeMl ?? null,
    awayCurrent: game.odds.awayMl ?? null,
    homeClose: null,
    awayClose: null,
    source: game.odds.source,
  };

  const snap = buildYachtSnapshot({
    gameId: game.id,
    sport: "mlb",
    league: game.league,
    modelVersion: MODEL_YACHT_MLB_CONTRACT,
    predictionAt,
    startAt: game.startAt,
    features,
    market,
  });

  return { ...snap, modelInputs: inputs };
}
