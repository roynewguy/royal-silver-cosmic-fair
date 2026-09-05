import { impliedFromAmerican } from "../../sports/odds.ts";
import { assertNoFutureGames, priorGames } from "../leakage.ts";
import type { HistoricalGame, HistoricalOdds, MlbRow, StarterFeat, TeamFeat } from "../types.ts";

const MIN_PRIOR = 10;

function won(game: HistoricalGame, abbr: string): boolean {
  if (game.homeScore == null || game.awayScore == null) return false;
  return abbr === game.homeAbbr ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
}

function runsFor(game: HistoricalGame, abbr: string): number {
  return abbr === game.homeAbbr ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
}

function runsAgainst(game: HistoricalGame, abbr: string): number {
  return abbr === game.homeAbbr ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
}

export function teamFeatures(priors: HistoricalGame[], abbr: string, startAt: string): TeamFeat | null {
  assertNoFutureGames(priors, startAt);
  if (priors.length < MIN_PRIOR) return null;
  const ordered = [...priors].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const wins = ordered.filter((g) => won(g, abbr)).length;
  const last5 = ordered.slice(-5);
  const last10 = ordered.slice(-10);
  const homeG = ordered.filter((g) => g.homeAbbr === abbr);
  const awayG = ordered.filter((g) => g.awayAbbr === abbr);
  const lastStart = ordered.at(-1)?.startAt;
  const restDays =
    lastStart != null ? Math.max(0, Math.round((+new Date(startAt) - +new Date(lastStart)) / 86_400_000)) : null;
  return {
    games: ordered.length,
    winPct: wins / ordered.length,
    last5: last5.filter((g) => won(g, abbr)).length / last5.length,
    last10: last10.filter((g) => won(g, abbr)).length / last10.length,
    homeWinPct: homeG.length ? homeG.filter((g) => won(g, abbr)).length / homeG.length : 0.5,
    awayWinPct: awayG.length ? awayG.filter((g) => won(g, abbr)).length / awayG.length : 0.5,
    runsForPg: ordered.reduce((s, g) => s + runsFor(g, abbr), 0) / ordered.length,
    runsAgainstPg: ordered.reduce((s, g) => s + runsAgainst(g, abbr), 0) / ordered.length,
    runDiffPg:
      ordered.reduce((s, g) => s + (runsFor(g, abbr) - runsAgainst(g, abbr)), 0) / ordered.length,
    restDays,
  };
}

export const MLB_FEATURE_NAMES = [
  "bias",
  "winpct_diff",
  "last5_diff",
  "last10_diff",
  "rdiff_diff",
  "rest_diff",
  "era_diff",
  "era_missing",
] as const;

export function featureVector(row: MlbRow): number[] {
  const h = row.features.home;
  const a = row.features.away;
  const eraH = row.features.homeStarter.era;
  const eraA = row.features.awayStarter.era;
  const eraMissing = eraH == null || eraA == null ? 1 : 0;
  return [
    1,
    h.winPct - a.winPct,
    h.last5 - a.last5,
    h.last10 - a.last10,
    h.runDiffPg - a.runDiffPg,
    (h.restDays ?? 3) - (a.restDays ?? 3),
    eraMissing ? 0 : (eraA ?? 0) - (eraH ?? 0),
    eraMissing,
  ];
}

export function buildMlbRows(
  games: HistoricalGame[],
  odds: HistoricalOdds[],
  starters: Record<string, { home: StarterFeat; away: StarterFeat }>,
): { rows: MlbRow[]; dropped: number } {
  const oddsBy = new Map(odds.map((o) => [o.gameId, o]));
  const sorted = [...games].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const rows: MlbRow[] = [];
  let dropped = 0;
  for (const game of sorted) {
    if (game.status !== "final" || game.homeScore == null || game.awayScore == null) {
      dropped += 1;
      continue;
    }
    if (game.homeScore === game.awayScore) {
      dropped += 1;
      continue;
    }
    const homePrior = priorGames(sorted, game.homeAbbr, game.startAt);
    const awayPrior = priorGames(sorted, game.awayAbbr, game.startAt);
    const home = teamFeatures(homePrior, game.homeAbbr, game.startAt);
    const away = teamFeatures(awayPrior, game.awayAbbr, game.startAt);
    if (!home || !away) {
      dropped += 1;
      continue;
    }
    const book = oddsBy.get(game.gameId);
    const closeHome = book?.homeClose ?? book?.homeOpen ?? null;
    const closeAway = book?.awayClose ?? book?.awayOpen ?? null;
    rows.push({
      gameId: game.gameId,
      season: game.season,
      startAt: game.startAt,
      homeAbbr: game.homeAbbr,
      awayAbbr: game.awayAbbr,
      homeWin: game.homeScore > game.awayScore,
      features: {
        capturedAt: game.startAt,
        knownBeforeStart: true,
        home,
        away,
        homeStarter: starters[game.gameId]?.home ?? { name: null, era: null, wins: null, losses: null },
        awayStarter: starters[game.gameId]?.away ?? { name: null, era: null, wins: null, losses: null },
        venue: game.venue,
      },
      market: {
        sportsbook: book?.sportsbook ?? "none",
        homeOpen: book?.homeOpen ?? null,
        awayOpen: book?.awayOpen ?? null,
        homeClose: closeHome,
        awayClose: closeAway,
        impliedHomeClose: closeHome != null ? impliedFromAmerican(closeHome) : null,
      },
    });
  }
  return { rows, dropped };
}
