import { impliedFromAmerican } from "../sports/odds.ts";
import { teamFeatures } from "../models-v3/features.ts";
import type { HistoricalGame, HistoricalOdds, StarterFeat } from "../models-v3/types.ts";
import { MODEL_YACHT_MLB_CONTRACT } from "./names.ts";
import { historicalPredictionAt } from "./live-snapshot.ts";
import {
  makeFeature,
  snapshotIdFrom,
  twoWayPregame,
  type YachtFeature,
  type YachtMarketSnapshot,
} from "./provenance.ts";
import { assertChronologicalRows, assertFeatureSetClean, assertPredictionBeforeStart, yachtPriorGames } from "./leakage.ts";
import { missingFeatures } from "./data-matrix.ts";

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
  league: "mlb";
  season: number;
  startAt: string;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string;
  awayTeam: string;
  venue: string | null;
  predictionAt: string;
  modelVersion: string;
  features: YachtFeature[];
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
  league: "mlb";
  name: "Model Yacht MLB Dataset v1";
  rows: YachtDatasetRow[];
  dropped: Array<{ gameId: string; reason: string }>;
  notes: string[];
};

function marketOf(book: HistoricalOdds | undefined, capturedAt: string | null): {
  pregame: YachtMarketSnapshot;
  closing: YachtMarketSnapshot;
} {
  const sportsbook = book?.sportsbook ?? "none";
  const pregame: YachtMarketSnapshot = {
    sportsbook,
    capturedAt,
    homeOpen: book?.homeOpen ?? null,
    awayOpen: book?.awayOpen ?? null,
    homeCurrent: book?.homeOpen ?? null,
    awayCurrent: book?.awayOpen ?? null,
    homeClose: null,
    awayClose: null,
    source: sportsbook,
  };
  const closing: YachtMarketSnapshot = {
    sportsbook,
    capturedAt: null,
    homeOpen: null,
    awayOpen: null,
    homeCurrent: null,
    awayCurrent: null,
    homeClose: book?.homeClose ?? null,
    awayClose: book?.awayClose ?? null,
    source: sportsbook,
  };
  return { pregame, closing };
}

export function buildYachtMlbDataset(input: {
  games: HistoricalGame[];
  odds: HistoricalOdds[];
  starters?: Record<string, { home: StarterFeat; away: StarterFeat }>;
  minPrior?: number;
  now?: string;
}): YachtDataset {
  const minPrior = input.minPrior ?? 10;
  void input.starters;
  const nowIso = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const oddsBy = new Map(input.odds.map((o) => [o.gameId, o]));
  const sorted = [...input.games].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const rows: YachtDatasetRow[] = [];
  const dropped: Array<{ gameId: string; reason: string }> = [];
  const notes = [
    "Model Yacht MLB Dataset v1. Research only. Not a production model switch.",
    "Stake/pregame market is opener only. Close is stored separately and never used as a feature or stake.",
    "Undifferentiated ESPN moneyLine is not treated as an opener.",
    "Starter ERA/WHIP from historical dumps is unproven point-in-time and is stored missing/unusable.",
    "FIP/xFIP/wRC+/handedness/bullpen/lineup/park factor/structured weather are missing — not invented.",
    "V2 live champion, soak, truth-gate, and Discord are unchanged.",
  ];

  for (const game of sorted) {
    if (game.league !== "mlb") {
      dropped.push({ gameId: game.gameId, reason: "not_mlb" });
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

    const homePriors = yachtPriorGames(sorted, game.homeAbbr, predictionAt);
    const awayPriors = yachtPriorGames(sorted, game.awayAbbr, predictionAt);
    const home = teamFeatures(homePriors, game.homeAbbr, game.startAt, minPrior);
    const away = teamFeatures(awayPriors, game.awayAbbr, game.startAt, minPrior);
    if (!home || !away) {
      dropped.push({ gameId: game.gameId, reason: "insufficient_priors" });
      continue;
    }

    const lastHome = homePriors.at(-1)?.startAt ?? null;
    const lastAway = awayPriors.at(-1)?.startAt ?? null;
    const book = oddsBy.get(game.gameId);
    const { pregame, closing } = marketOf(book, predictionAt);
    const twoWay = twoWayPregame(pregame);
    if (!twoWay) {
      dropped.push({ gameId: game.gameId, reason: "PASS_MARKET_INCOMPLETE" });
      continue;
    }

    const features: YachtFeature[] = [
      makeFeature({ key: "home_win_pct", value: home.winPct, source: "historical_games.priors", knownAt: lastHome, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "away_win_pct", value: away.winPct, source: "historical_games.priors", knownAt: lastAway, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "home_last5", value: home.last5, source: "historical_games.priors", knownAt: lastHome, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "away_last5", value: away.last5, source: "historical_games.priors", knownAt: lastAway, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "home_last10", value: home.last10, source: "historical_games.priors", knownAt: lastHome, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "away_last10", value: away.last10, source: "historical_games.priors", knownAt: lastAway, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "home_rdiff_pg", value: home.runDiffPg, source: "historical_games.priors", knownAt: lastHome, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "away_rdiff_pg", value: away.runDiffPg, source: "historical_games.priors", knownAt: lastAway, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "home_rest_days", value: home.restDays, source: "historical_games.priors", knownAt: lastHome, capturedAt: predictionAt, predictionAt, quality: home.restDays != null ? 1 : 0 }),
      makeFeature({ key: "away_rest_days", value: away.restDays, source: "historical_games.priors", knownAt: lastAway, capturedAt: predictionAt, predictionAt, quality: away.restDays != null ? 1 : 0 }),
      makeFeature({ key: "venue", value: game.venue, source: "espn-site-scoreboard", knownAt: predictionAt, capturedAt: predictionAt, predictionAt, quality: game.venue ? 0.9 : 0 }),
      makeFeature({ key: "home_open_ml", value: pregame.homeOpen, source: book?.sportsbook ?? "none", knownAt: predictionAt, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({ key: "away_open_ml", value: pregame.awayOpen, source: book?.sportsbook ?? "none", knownAt: predictionAt, capturedAt: predictionAt, predictionAt, quality: 1 }),
      makeFeature({
        key: "open_no_vig_home",
        value: twoWay ? impliedFromAmerican(twoWay.home) / (impliedFromAmerican(twoWay.home) + impliedFromAmerican(twoWay.away)) : null,
        source: book?.sportsbook ?? "none",
        knownAt: predictionAt,
        capturedAt: predictionAt,
        predictionAt,
        quality: 1,
      }),
      makeFeature({ key: "starter_era_home", value: null, source: "espn-probable-unproven", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
      makeFeature({ key: "starter_era_away", value: null, source: "espn-probable-unproven", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
    ];
    for (const name of missingFeatures()) {
      features.push(makeFeature({ key: name, value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }));
    }

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

    const usable = features.filter((f) => f.usable).length;
    const snapshotId = snapshotIdFrom([game.gameId, predictionAt, pregame.homeOpen, pregame.awayOpen]);
    const rowId = snapshotIdFrom(["row", game.gameId, predictionAt]);
    rows.push({
      rowId,
      snapshotId,
      gameId: game.gameId,
      league: "mlb",
      season: game.season,
      startAt: game.startAt,
      homeAbbr: game.homeAbbr,
      awayAbbr: game.awayAbbr,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      venue: game.venue,
      predictionAt,
      modelVersion: MODEL_YACHT_MLB_CONTRACT,
      features,
      target,
      pregameMarket: pregame,
      closingMarket: closing,
      missing: features.filter((f) => f.missing).map((f) => f.key),
      dataQuality: Math.max(0, Math.min(1, usable / Math.max(features.length, 1))),
      provenanceOk: true,
      droppedReason: null,
      sourceNotes: ["priors=historical_games", "market=opener-only", "close=evaluation-only"],
    });
  }

  assertChronologicalRows(rows.map((r) => r.startAt));
  return {
    createdAt: nowIso,
    version: MODEL_YACHT_MLB_CONTRACT,
    league: "mlb",
    name: "Model Yacht MLB Dataset v1",
    rows,
    dropped,
    notes,
  };
}
