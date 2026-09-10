import { impliedFromAmerican, parseWinPct } from "../sports/odds.ts";
import { weightedInjuryImpact } from "../sports/player-impact.ts";
import { buildMarketConsensus } from "../sports/market-consensus.ts";
import { makeFeature, provenPregameTwoWay, type YachtFeature, type YachtMarketSnapshot } from "./core/provenance.ts";
import { priorKnownAt } from "./core/leakage.ts";
import type { YachtDataSourceRow } from "./data-matrix.ts";
import type { YachtHistContext, YachtLiveContext } from "./provider.ts";
import type { GameCard } from "../sports/types.ts";

export const SHARED_MARKET_MATRIX: YachtDataSourceRow[] = [
  { feature: "opening market", currentlyAvailable: "partial", currentSource: "ESPN BET nested open (historical). Live DK first-seen via dk-open (home+away).", reliability: "medium", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "The Odds API historical (paid, stubbed). Do not use close as open." },
  { feature: "current market", currentlyAvailable: "yes", currentSource: "The Odds API DraftKings snapshot + ESPN listed ML", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Keep DK as official current. Preserve both sides." },
  { feature: "DraftKings", currentlyAvailable: "yes", currentSource: "The Odds API bookmaker=draftkings (live). Historical plan not wired.", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Paid Odds API historical if operator opts in. Never scrape DK HTML." },
  { feature: "FanDuel", currentlyAvailable: "partial", currentSource: "Odds API event bookmakers → market-consensus (live scan only)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Same Odds API event payload. Not official BoatBoyz stake." },
  { feature: "BetMGM", currentlyAvailable: "partial", currentSource: "Odds API event bookmakers → market-consensus (live scan only)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Same Odds API event payload." },
  { feature: "Caesars", currentlyAvailable: "partial", currentSource: "Odds API williamhill_us → market-consensus (live scan only)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Same Odds API event payload." },
  { feature: "consensus probability", currentlyAvailable: "partial", currentSource: "buildMarketConsensus (DK/FD/MGM/Caesars two-way no-vig)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Only when quotesFromEvent returns 2+ two-way books." },
  { feature: "market dispersion", currentlyAvailable: "partial", currentSource: "MarketConsensus.dispersion", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Keep; missing books → missing, not 0." },
  { feature: "line movement", currentlyAvailable: "partial", currentSource: "open vs current implied. Needs both sides + timestamps.", reliability: "medium", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Move only when open and current are proven pregame. Close is not a move endpoint for features." },
];

export const SHARED_TEAM_MATRIX: YachtDataSourceRow[] = [
  { feature: "team form last 5 / last 10 / score diff", currentlyAvailable: "yes", currentSource: "historical_games priors via teamFeatures (finals only)", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Reuse. Sport adapter supplies prior-completion buffer." },
  { feature: "injuries", currentlyAvailable: "yes", currentSource: "ESPN injury board + player-impact", reliability: "medium", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "known_at = injuriesFetchedAt. Missing board → quality penalty, not invented outs." },
  { feature: "park / venue name", currentlyAvailable: "yes", currentSource: "ESPN site scoreboard venue", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Keep ESPN venue; do not invent sport-specific park factors from the name." },
  { feature: "weather string", currentlyAvailable: "partial", currentSource: "ESPN GameCard.weather", reliability: "low", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Keep as a raw string with known_at = weatherFetchedAt." },
  { feature: "travel/rest", currentlyAvailable: "partial", currentSource: "restDays from prior finals (start-to-start)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "RestDays is leak-safe from priors. Travel miles / timezone are not available." },
];

export function unavailable(feature: string, source: string): YachtDataSourceRow {
  return {
    feature,
    currentlyAvailable: "no",
    currentSource: "none",
    reliability: "none",
    timestampAvailable: "no",
    historicalDataAvailable: "no",
    liveDataAvailable: "no",
    missing: true,
    recommendedFutureSource: source,
  };
}

export function missingPlaceholders(matrix: YachtDataSourceRow[], predictionAt: string): YachtFeature[] {
  return matrix
    .filter((r) => r.missing && r.currentlyAvailable === "no")
    .map((r) =>
      makeFeature({
        key: r.feature,
        value: null,
        source: "none",
        knownAt: null,
        capturedAt: null,
        predictionAt,
        missing: true,
        quality: 0,
      }),
    );
}

function sourceTime(field: string | null | undefined): string | null {
  return field ?? null;
}

export function sharedHistoricalForm(ctx: YachtHistContext, keys: { scoreDiffHome: string; scoreDiffAway: string }): YachtFeature[] {
  const { homeForm: home, awayForm: away, lastHomeAt, lastAwayAt, predictionAt, pregame, game, priorCompleteMs } = ctx;
  if (!home || !away) return [];
  const homeKnown = lastHomeAt ? priorKnownAt(lastHomeAt, priorCompleteMs) : null;
  const awayKnown = lastAwayAt ? priorKnownAt(lastAwayAt, priorCompleteMs) : null;
  const openKnown = pregame.openCapturedAt;
  const provenOpen = provenPregameTwoWay(pregame, predictionAt)?.kind === "open";
  const noVig =
    provenOpen && pregame.homeOpen != null && pregame.awayOpen != null
      ? impliedFromAmerican(pregame.homeOpen) / (impliedFromAmerican(pregame.homeOpen) + impliedFromAmerican(pregame.awayOpen))
      : null;
  return [
    makeFeature({ key: "home_win_pct", value: home.winPct, source: "historical_games.priors", knownAt: homeKnown, capturedAt: homeKnown, predictionAt, quality: 1 }),
    makeFeature({ key: "away_win_pct", value: away.winPct, source: "historical_games.priors", knownAt: awayKnown, capturedAt: awayKnown, predictionAt, quality: 1 }),
    makeFeature({ key: "home_last5", value: home.last5, source: "historical_games.priors", knownAt: homeKnown, capturedAt: homeKnown, predictionAt, quality: 1 }),
    makeFeature({ key: "away_last5", value: away.last5, source: "historical_games.priors", knownAt: awayKnown, capturedAt: awayKnown, predictionAt, quality: 1 }),
    makeFeature({ key: "home_last10", value: home.last10, source: "historical_games.priors", knownAt: homeKnown, capturedAt: homeKnown, predictionAt, quality: 1 }),
    makeFeature({ key: "away_last10", value: away.last10, source: "historical_games.priors", knownAt: awayKnown, capturedAt: awayKnown, predictionAt, quality: 1 }),
    makeFeature({ key: keys.scoreDiffHome, value: home.runDiffPg, source: "historical_games.priors", knownAt: homeKnown, capturedAt: homeKnown, predictionAt, quality: 1 }),
    makeFeature({ key: keys.scoreDiffAway, value: away.runDiffPg, source: "historical_games.priors", knownAt: awayKnown, capturedAt: awayKnown, predictionAt, quality: 1 }),
    makeFeature({ key: "home_rest_days", value: home.restDays, source: "historical_games.priors", knownAt: homeKnown, capturedAt: homeKnown, predictionAt, quality: home.restDays != null ? 1 : 0 }),
    makeFeature({ key: "away_rest_days", value: away.restDays, source: "historical_games.priors", knownAt: awayKnown, capturedAt: awayKnown, predictionAt, quality: away.restDays != null ? 1 : 0 }),
    makeFeature({ key: "venue", value: game.venue, source: "espn-site-scoreboard", knownAt: null, capturedAt: null, predictionAt, quality: 0 }),
    makeFeature({ key: "home_open_ml", value: pregame.homeOpen, source: pregame.sportsbook, knownAt: openKnown, capturedAt: openKnown, predictionAt, quality: provenOpen ? 1 : 0 }),
    makeFeature({ key: "away_open_ml", value: pregame.awayOpen, source: pregame.sportsbook, knownAt: openKnown, capturedAt: openKnown, predictionAt, quality: provenOpen ? 1 : 0 }),
    makeFeature({ key: "open_no_vig_home", value: noVig, source: pregame.sportsbook, knownAt: openKnown, capturedAt: openKnown, predictionAt, quality: noVig != null ? 1 : 0 }),
  ];
}

export function sharedLiveCardFeatures(ctx: YachtLiveContext): YachtFeature[] {
  const { game, predictionAt } = ctx;
  const boardAt = sourceTime(game.fetchedAt);
  const weatherAt = sourceTime(game.weatherFetchedAt);
  const injuryAt = sourceTime(game.injuriesFetchedAt);
  const oddsAt = sourceTime(game.odds.capturedAt);
  const inj = weightedInjuryImpact(game);
  const consensus = game.shadows?.consensus ?? buildMarketConsensus(game.shadows?.consensus?.books ?? []);
  return [
    makeFeature({ key: "venue", value: game.venue, source: "espn-site-scoreboard", knownAt: boardAt, capturedAt: boardAt, predictionAt, quality: game.venue && boardAt ? 1 : 0 }),
    makeFeature({ key: "weather_string", value: game.weather, source: "espn-weather", knownAt: weatherAt, capturedAt: weatherAt, predictionAt, quality: game.weather && weatherAt ? 0.6 : 0 }),
    makeFeature({ key: "home_win_pct", value: parseWinPct(game.home.record), source: "espn-record", knownAt: boardAt, capturedAt: boardAt, predictionAt, quality: boardAt ? 0.7 : 0 }),
    makeFeature({ key: "away_win_pct", value: parseWinPct(game.away.record), source: "espn-record", knownAt: boardAt, capturedAt: boardAt, predictionAt, quality: boardAt ? 0.7 : 0 }),
    makeFeature({ key: "injury_away_minus_home", value: inj.away - inj.home, source: "espn-injury-board+player-impact", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.7 : 0 }),
    makeFeature({ key: "consensus_home", value: consensus?.noVigHome ?? null, source: "odds-api-consensus", knownAt: oddsAt, capturedAt: oddsAt, predictionAt, quality: consensus?.noVigHome != null && oddsAt ? 0.8 : 0 }),
    makeFeature({ key: "market_dispersion", value: consensus?.dispersion ?? null, source: "odds-api-consensus", knownAt: oddsAt, capturedAt: oddsAt, predictionAt, quality: consensus && consensus.books.length >= 2 && oddsAt ? 0.8 : 0 }),
  ];
}

export function liveMarketSnapshot(game: GameCard): YachtMarketSnapshot {
  return {
    sportsbook: game.odds.book,
    capturedAt: game.odds.capturedAt ?? null,
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
}
