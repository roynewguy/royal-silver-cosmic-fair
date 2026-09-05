import { priorGames } from "./leakage.ts";
import { RESEARCH_BY_ID } from "./sports.ts";
import { featureVector, teamFeatures } from "./features.ts";
import { seasonOf } from "./parse.ts";
import type { HistoricalGame, TrainingRow } from "./types.ts";
import type { GameCard } from "../sports/types.ts";

export function gameCardToHistorical(game: GameCard): HistoricalGame {
  const homeScore = game.home.score;
  const awayScore = game.away.score;
  return {
    gameId: game.id,
    espnId: game.espnId,
    sport: game.sport,
    league: game.league,
    season: seasonOf(game.startAt),
    startAt: game.startAt,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    homeAbbr: game.home.abbr,
    awayAbbr: game.away.abbr,
    homeScore,
    awayScore,
    status: game.status,
    venue: game.venue,
    homeWin:
      game.status === "final" && homeScore != null && awayScore != null ? homeScore > awayScore : null,
  };
}

export type LiveFeatureResult =
  | { ok: true; vector: number[]; row: TrainingRow; missing: string[] }
  | { ok: false; missing: string[]; vector: null; row: null };

export function buildLiveTrainingRow(
  game: GameCard,
  history: HistoricalGame[],
  now = Date.now(),
): LiveFeatureResult {
  const missing: string[] = [];
  if (game.status !== "scheduled") return { ok: false, missing: ["not_scheduled"], vector: null, row: null };
  if (new Date(game.startAt).getTime() <= now) return { ok: false, missing: ["already_started"], vector: null, row: null };

  const spec = RESEARCH_BY_ID[game.league];
  const minPrior = spec?.minPrior ?? 10;
  const homePrior = priorGames(history, game.home.abbr, game.startAt);
  const awayPrior = priorGames(history, game.away.abbr, game.startAt);
  const home = teamFeatures(homePrior, game.home.abbr, game.startAt, minPrior);
  const away = teamFeatures(awayPrior, game.away.abbr, game.startAt, minPrior);
  if (!home) missing.push("home_form");
  if (!away) missing.push("away_form");
  if (home && home.restDays == null) missing.push("home_rest");
  if (away && away.restDays == null) missing.push("away_rest");
  if (missing.length) return { ok: false, missing, vector: null, row: null };

  const row: TrainingRow = {
    gameId: game.id,
    league: game.league,
    season: seasonOf(game.startAt),
    startAt: game.startAt,
    homeAbbr: game.home.abbr,
    awayAbbr: game.away.abbr,
    homeWin: false,
    features: {
      capturedAt: new Date(now).toISOString(),
      knownBeforeStart: true,
      home: home!,
      away: away!,
      homeStarter: {
        name: game.home.starter?.name ?? null,
        era: game.home.starter?.era ?? null,
        wins: null,
        losses: null,
      },
      awayStarter: {
        name: game.away.starter?.name ?? null,
        era: game.away.starter?.era ?? null,
        wins: null,
        losses: null,
      },
      venue: game.venue,
    },
    market: {
      sportsbook: game.odds.book,
      homeOpen: game.odds.openHomeMl,
      awayOpen: null,
      homeClose: game.odds.homeMl,
      awayClose: game.odds.awayMl,
      impliedHomeClose: null,
    },
  };
  return { ok: true, vector: featureVector(row), row, missing: [] };
}
