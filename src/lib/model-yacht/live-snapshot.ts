import { CANONICAL_LEAD_MS } from "../models-v3/integrity.ts";
import { mlbShadowFeatures } from "../models-v3/mlb-shadow-features.ts";
import { packModelInputs } from "../sports/model-inputs.ts";
import { weightedInjuryImpact } from "../sports/player-impact.ts";
import { buildMarketConsensus } from "../sports/market-consensus.ts";
import type { GameCard } from "../sports/types.ts";
import { MODEL_YACHT_MLB_CONTRACT } from "./names.ts";
import { makeFeature, snapshotIdFrom, twoWayPregame, type YachtFeature, type YachtMarketSnapshot } from "./provenance.ts";
import { missingFeatures } from "./data-matrix.ts";

export type YachtLiveSnapshot = {
  snapshotId: string;
  gameId: string;
  league: string;
  modelVersion: string;
  predictionAt: string;
  startAt: string;
  features: YachtFeature[];
  market: YachtMarketSnapshot;
  missing: string[];
  dataQuality: number;
  provenanceOk: boolean;
  modelInputs: ReturnType<typeof packModelInputs>;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
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

function featureTime(card: GameCard, nowIso: string, field: string | null | undefined): string | null {
  return field ?? card.fetchedAt ?? card.odds.capturedAt ?? nowIso;
}

export function buildYachtLiveSnapshot(game: GameCard, now = Date.now()): YachtLiveSnapshot | null {
  if (game.league !== "mlb") return null;
  const predictionAt = yachtPredictionAt(game.startAt, now);
  if (!predictionAt) return null;

  const capturedAt = game.odds.capturedAt ?? game.fetchedAt ?? predictionAt;
  const shadow = mlbShadowFeatures(game);
  const inj = weightedInjuryImpact(game);
  const consensus = game.shadows?.consensus ?? buildMarketConsensus(game.shadows?.consensus?.books ?? []);
  const inputs = packModelInputs(game);

  const features: YachtFeature[] = [
    makeFeature({ key: "venue", value: game.venue, source: "espn-site-scoreboard", knownAt: featureTime(game, predictionAt, game.fetchedAt), capturedAt, predictionAt, quality: game.venue ? 1 : 0 }),
    makeFeature({ key: "weather_string", value: game.weather, source: "espn-weather", knownAt: featureTime(game, predictionAt, game.weatherFetchedAt), capturedAt, predictionAt, quality: game.weather && game.weatherFetchedAt ? 0.6 : 0.3 }),
    makeFeature({ key: "home_era", value: shadow.eraHome, source: "espn-probable", knownAt: featureTime(game, predictionAt, game.startersFetchedAt), capturedAt, predictionAt, quality: game.startersFetchedAt ? 0.55 : 0.2 }),
    makeFeature({ key: "away_era", value: shadow.eraAway, source: "espn-probable", knownAt: featureTime(game, predictionAt, game.startersFetchedAt), capturedAt, predictionAt, quality: game.startersFetchedAt ? 0.55 : 0.2 }),
    makeFeature({ key: "home_whip", value: shadow.whipHome, source: "espn-probable", knownAt: featureTime(game, predictionAt, game.startersFetchedAt), capturedAt, predictionAt, quality: game.startersFetchedAt ? 0.55 : 0.2 }),
    makeFeature({ key: "away_whip", value: shadow.whipAway, source: "espn-probable", knownAt: featureTime(game, predictionAt, game.startersFetchedAt), capturedAt, predictionAt, quality: game.startersFetchedAt ? 0.55 : 0.2 }),
    makeFeature({ key: "home_win_pct", value: shadow.homeWinPct, source: "espn-record", knownAt: featureTime(game, predictionAt, game.fetchedAt), capturedAt, predictionAt, quality: 0.7 }),
    makeFeature({ key: "away_win_pct", value: shadow.awayWinPct, source: "espn-record", knownAt: featureTime(game, predictionAt, game.fetchedAt), capturedAt, predictionAt, quality: 0.7 }),
    makeFeature({ key: "injury_away_minus_home", value: inj.away - inj.home, source: "espn-injury-board+player-impact", knownAt: featureTime(game, predictionAt, game.injuriesFetchedAt), capturedAt, predictionAt, quality: game.injuriesFetchedAt ? 0.7 : 0.2 }),
    makeFeature({ key: "consensus_home", value: consensus?.noVigHome ?? null, source: "odds-api-consensus", knownAt: featureTime(game, predictionAt, game.odds.capturedAt), capturedAt, predictionAt, quality: consensus?.noVigHome != null ? 0.8 : 0 }),
    makeFeature({ key: "market_dispersion", value: consensus?.dispersion ?? null, source: "odds-api-consensus", knownAt: featureTime(game, predictionAt, game.odds.capturedAt), capturedAt, predictionAt, quality: consensus && consensus.books.length >= 2 ? 0.8 : 0 }),
  ];

  for (const name of missingFeatures()) {
    features.push(makeFeature({ key: name, value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }));
  }

  const market: YachtMarketSnapshot = {
    sportsbook: game.odds.book,
    capturedAt: game.odds.capturedAt,
    homeOpen: game.odds.openHomeMl ?? null,
    awayOpen: game.odds.openAwayMl ?? null,
    homeCurrent: game.odds.homeMl ?? null,
    awayCurrent: game.odds.awayMl ?? null,
    homeClose: null,
    awayClose: null,
    source: game.odds.source,
  };

  const twoWay = twoWayPregame(market);
  const usable = features.filter((f) => f.usable).length;
  const provenanceOk = twoWay != null && Date.parse(predictionAt) < Date.parse(game.startAt);
  const snapshotId = snapshotIdFrom([game.id, predictionAt, MODEL_YACHT_MLB_CONTRACT, market.homeCurrent, market.awayCurrent]);

  return {
    snapshotId,
    gameId: game.id,
    league: game.league,
    modelVersion: MODEL_YACHT_MLB_CONTRACT,
    predictionAt,
    startAt: game.startAt,
    features,
    market,
    missing: features.filter((f) => f.missing).map((f) => f.key),
    dataQuality: Math.max(0, Math.min(1, usable / Math.max(features.length, 1))),
    provenanceOk,
    modelInputs: inputs,
  };
}
