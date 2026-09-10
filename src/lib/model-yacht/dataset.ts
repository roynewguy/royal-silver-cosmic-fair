import { teamFeatures } from "../models-v3/features.ts";
import type { HistoricalGame, HistoricalOdds, StarterFeat } from "../models-v3/types.ts";
import { historicalPredictionAt, snapshotIdFrom } from "./core/snapshot.ts";
import { twoWayPregame, validateSnapshotProvenance, type YachtMarketSnapshot } from "./core/provenance.ts";
import { assertChronologicalRows, assertFeatureSetClean, assertPredictionBeforeStart, yachtPriorGames } from "./core/leakage.ts";
import { type SportFeatureProvider } from "./provider.ts";
import type { YachtSport } from "./sports.ts";
import "./adapters.ts";

export { buildYachtMlbDataset, type YachtDataset as MlbYachtDataset, type YachtDatasetRow as MlbYachtDatasetRow, type YachtTarget as MlbYachtTarget } from "./sports/mlb/dataset.ts";

export type YachtTarget = {
  homeWin: boolean | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type YachtDatasetRow = {
  rowId: string;
  snapshotId: string;
  gameId: string;
  league: YachtSport | string;
  season: number;
  startAt: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
  venue: string | null;
  predictionAt: string;
  modelVersion: string;
  features: import("./provenance.ts").YachtFeature[];
  target: YachtTarget;
  pregameMarket: YachtMarketSnapshot;
  closingMarket: YachtMarketSnapshot;
  missing: string[];
  dataQuality: number;
  provenanceOk: boolean;
  droppedReason: string | null;
  sourceNotes: string[];
};

export type YachtDataset = {
  createdAt: string;
  version: string;
  league: YachtSport | string;
  name: string;
  rows: YachtDatasetRow[];
  dropped: Array<{ gameId: string; reason: string }>;
  notes: string[];
};

function marketOf(book: HistoricalOdds | undefined): { pregame: YachtMarketSnapshot; closing: YachtMarketSnapshot } {
  const sportsbook = book?.sportsbook ?? "none";
  const openCapturedAt = book?.openCapturedAt ?? null;
  const closeCapturedAt = book?.closeCapturedAt ?? null;
  return {
    pregame: {
      sportsbook,
      capturedAt: null,
      openCapturedAt,
      closeCapturedAt: null,
      homeOpen: book?.homeOpen ?? null,
      awayOpen: book?.awayOpen ?? null,
      homeCurrent: book?.homeOpen ?? null,
      awayCurrent: book?.awayOpen ?? null,
      homeClose: null,
      awayClose: null,
      source: sportsbook,
    },
    closing: {
      sportsbook,
      capturedAt: closeCapturedAt,
      openCapturedAt: null,
      closeCapturedAt,
      homeOpen: null,
      awayOpen: null,
      homeCurrent: null,
      awayCurrent: null,
      homeClose: book?.homeClose ?? null,
      awayClose: book?.awayClose ?? null,
      source: sportsbook,
    },
  };
}

export function buildYachtDataset(input: {
  provider: SportFeatureProvider;
  games: HistoricalGame[];
  odds: HistoricalOdds[];
  starters?: Record<string, { home: StarterFeat; away: StarterFeat }>;
  minPrior?: number;
  now?: string;
}): YachtDataset {
  const provider = input.provider;
  const minPrior = input.minPrior ?? provider.minPrior;
  void input.starters;
  const nowIso = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const oddsBy = new Map(input.odds.map((o) => [o.gameId, o]));
  const sorted = [...input.games].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const rows: YachtDatasetRow[] = [];
  const dropped: Array<{ gameId: string; reason: string }> = [];

  for (const game of sorted) {
    if (game.league !== provider.sport) {
      dropped.push({ gameId: game.gameId, reason: "wrong_sport" });
      continue;
    }
    if (Date.parse(game.startAt) > nowMs) {
      dropped.push({ gameId: game.gameId, reason: "future_game" });
      continue;
    }
    const predictionAt = historicalPredictionAt(game.startAt);
    if (!predictionAt) {
      dropped.push({ gameId: game.gameId, reason: "prediction_at" });
      continue;
    }
    try {
      assertPredictionBeforeStart(predictionAt, game.startAt);
    } catch {
      dropped.push({ gameId: game.gameId, reason: "prediction_not_before_start" });
      continue;
    }

    const homePriors = yachtPriorGames(sorted, game.homeAbbr, predictionAt, provider.priorCompleteMs);
    const awayPriors = yachtPriorGames(sorted, game.awayAbbr, predictionAt, provider.priorCompleteMs);
    const home = provider.family === "fight" ? null : teamFeatures(homePriors, game.homeAbbr, game.startAt, minPrior);
    const away = provider.family === "fight" ? null : teamFeatures(awayPriors, game.awayAbbr, game.startAt, minPrior);
    if (provider.family !== "fight" && (!home || !away)) {
      dropped.push({ gameId: game.gameId, reason: "insufficient_priors" });
      continue;
    }

    const book = oddsBy.get(game.gameId);
    const { pregame, closing } = marketOf(book);
    if (!twoWayPregame(pregame)) {
      dropped.push({ gameId: game.gameId, reason: "PASS_MARKET_INCOMPLETE" });
      continue;
    }

    const features = provider.historicalFeatures({
      game,
      predictionAt,
      homeForm: home,
      awayForm: away,
      lastHomeAt: homePriors.at(-1)?.startAt ?? null,
      lastAwayAt: awayPriors.at(-1)?.startAt ?? null,
      priorCompleteMs: provider.priorCompleteMs,
      pregame,
    });

    try {
      assertFeatureSetClean(features, predictionAt);
    } catch {
      dropped.push({ gameId: game.gameId, reason: "feature_leak" });
      continue;
    }

    const final = game.status === "final" && game.homeScore != null && game.awayScore != null && game.homeScore !== game.awayScore;
    const target: YachtTarget = {
      homeWin: final ? game.homeScore! > game.awayScore! : null,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      status: game.status,
    };
    if (!final || target.homeWin == null) {
      dropped.push({ gameId: game.gameId, reason: "no_target" });
      continue;
    }

    const provenanceOk = validateSnapshotProvenance({ predictionAt, startAt: game.startAt, market: pregame, features });
    const usable = features.filter((f) => f.usable).length;
    const snapshotId = snapshotIdFrom({
      sport: provider.sport,
      modelVersion: provider.contractVersion,
      gameId: game.gameId,
      predictionAt,
      marketFingerprint: `${pregame.openCapturedAt ?? ""}|${pregame.homeOpen}|${pregame.awayOpen}`,
    });
    const rowId = snapshotIdFrom({
      sport: provider.sport,
      modelVersion: provider.contractVersion,
      gameId: `row:${game.gameId}`,
      predictionAt,
    });
    rows.push({
      rowId,
      snapshotId,
      gameId: game.gameId,
      league: provider.sport,
      season: game.season,
      startAt: game.startAt,
      homeAbbr: game.homeAbbr,
      awayAbbr: game.awayAbbr,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      venue: game.venue,
      predictionAt,
      modelVersion: provider.contractVersion,
      features,
      target,
      pregameMarket: pregame,
      closingMarket: closing,
      missing: features.filter((f) => f.missing).map((f) => f.key),
      dataQuality: Math.max(0, Math.min(1, usable / Math.max(features.length, 1))),
      provenanceOk,
      droppedReason: null,
      sourceNotes: provenanceOk
        ? [`adapter=${provider.sport}`, "market=opener-timestamped", "close=evaluation-only"]
        : [`adapter=${provider.sport}`, "market=unproven-timestamp", "audit-only"],
    });
  }

  assertChronologicalRows(rows.map((r) => r.startAt));
  return {
    createdAt: nowIso,
    version: provider.contractVersion,
    league: provider.sport,
    name: provider.datasetName,
    rows,
    dropped,
    notes: [
      `${provider.datasetName}. Research only. Not a production model switch.`,
      "Stake/pregame market is opener only when openCapturedAt is proven <= predictionAt.",
      ...provider.notes,
    ],
  };
}
