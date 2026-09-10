import { mlbShadowFeatures } from "../models-v3/mlb-shadow-features.ts";
import { YACHT_MLB_DATA_MATRIX, type YachtDataSourceRow } from "./data-matrix.ts";
import { YACHT_NFL_DATA_MATRIX } from "./sports/nfl/data-matrix.ts";
import { nflHistoricalFeatures, nflLiveFeatures } from "./intelligence/sports/nfl/live-features.ts";
import { makeFeature, type YachtFeature } from "./provenance.ts";
import { registerYachtProvider, type SportFeatureProvider, type YachtHistContext, type YachtLiveContext } from "./provider.ts";
import { missingPlaceholders, sharedHistoricalForm, sharedLiveCardFeatures, SHARED_MARKET_MATRIX, SHARED_TEAM_MATRIX, unavailable } from "./shared.ts";
import { yachtVersion, type YachtSport } from "./sports.ts";

const HOUR = 3_600_000;

function teamKeys() {
  return { scoreDiffHome: "home_score_diff_pg", scoreDiffAway: "away_score_diff_pg" };
}

function teamHistorical(ctx: YachtHistContext, matrix: YachtDataSourceRow[]): YachtFeature[] {
  return [...sharedHistoricalForm(ctx, teamKeys()), ...missingPlaceholders(matrix, ctx.predictionAt)];
}

function teamLive(ctx: YachtLiveContext, matrix: YachtDataSourceRow[]): YachtFeature[] {
  return [...sharedLiveCardFeatures(ctx), ...missingPlaceholders(matrix, ctx.predictionAt)];
}

function teamProvider(input: {
  sport: YachtSport;
  displayName: string;
  minPrior: number;
  priorCompleteMs: number;
  extra: YachtDataSourceRow[];
  notes: string[];
  historical?: SportFeatureProvider["historicalFeatures"];
  live?: SportFeatureProvider["liveFeatures"];
}): SportFeatureProvider {
  const matrix = [...SHARED_MARKET_MATRIX, ...SHARED_TEAM_MATRIX, ...input.extra];
  return {
    sport: input.sport,
    displayName: input.displayName,
    family: "team-game",
    minPrior: input.minPrior,
    priorCompleteMs: input.priorCompleteMs,
    contractVersion: yachtVersion(input.sport),
    datasetName: `Model Yacht ${input.displayName} Dataset v1`,
    notes: input.notes,
    matrix,
    historicalFeatures: input.historical ?? ((ctx) => teamHistorical(ctx, matrix)),
    liveFeatures: input.live ?? ((ctx) => teamLive(ctx, matrix)),
  };
}

const mlb: SportFeatureProvider = teamProvider({
  sport: "mlb",
  displayName: "MLB",
  minPrior: 10,
  priorCompleteMs: 3.5 * HOUR,
  extra: YACHT_MLB_DATA_MATRIX.filter((r) => !SHARED_MARKET_MATRIX.some((s) => s.feature === r.feature) && !SHARED_TEAM_MATRIX.some((s) => s.feature === r.feature)),
  notes: [
    "MLB is the first deep specialization. FIP/xFIP/wRC+/bullpen/lineups stay missing until a dated source exists.",
    "Historical starter ERA from ESPN dumps is unproven — stored missing.",
  ],
  historical: (ctx) => [
    ...sharedHistoricalForm(ctx, { scoreDiffHome: "home_rdiff_pg", scoreDiffAway: "away_rdiff_pg" }),
    makeFeature({ key: "starter_era_home", value: null, source: "espn-probable-unproven", knownAt: null, capturedAt: null, predictionAt: ctx.predictionAt, missing: true, quality: 0 }),
    makeFeature({ key: "starter_era_away", value: null, source: "espn-probable-unproven", knownAt: null, capturedAt: null, predictionAt: ctx.predictionAt, missing: true, quality: 0 }),
    ...missingPlaceholders(YACHT_MLB_DATA_MATRIX, ctx.predictionAt),
  ],
  live: (ctx) => {
    const shadow = mlbShadowFeatures(ctx.game);
    const starterAt = ctx.game.startersFetchedAt ?? null;
    return [
      ...sharedLiveCardFeatures(ctx),
      makeFeature({ key: "home_era", value: shadow.eraHome, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt: ctx.predictionAt, quality: starterAt ? 0.55 : 0 }),
      makeFeature({ key: "away_era", value: shadow.eraAway, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt: ctx.predictionAt, quality: starterAt ? 0.55 : 0 }),
      makeFeature({ key: "home_whip", value: shadow.whipHome, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt: ctx.predictionAt, quality: starterAt ? 0.55 : 0 }),
      makeFeature({ key: "away_whip", value: shadow.whipAway, source: "espn-probable", knownAt: starterAt, capturedAt: starterAt, predictionAt: ctx.predictionAt, quality: starterAt ? 0.55 : 0 }),
      ...missingPlaceholders(YACHT_MLB_DATA_MATRIX, ctx.predictionAt),
    ];
  },
});

const nflExtra: YachtDataSourceRow[] = YACHT_NFL_DATA_MATRIX.filter(
  (r) => !SHARED_MARKET_MATRIX.some((s) => s.feature === r.feature) && !SHARED_TEAM_MATRIX.some((s) => s.feature === r.feature),
);

const nbaExtra: YachtDataSourceRow[] = [
  unavailable("ORtg / DRtg", "NBA stats team ratings as-of date. Not ESPN record string."),
  unavailable("net rating", "Derived from ORtg/DRtg once those exist."),
  unavailable("pace", "Possessions per 48 from NBA stats as-of."),
  unavailable("lineup combinations", "Lineup net rating. Confirmed lineup not on GameCard."),
  unavailable("minutes restrictions", "Injury report minutes cap. Do not invent."),
  { feature: "back-to-backs", currentlyAvailable: "partial", currentSource: "restDays from priors (0 ≈ B2B)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Explicit B2B flag from schedule once restDays is proven." },
];

const nhlExtra: YachtDataSourceRow[] = [
  unavailable("xG", "Natural Stat Trick / NHL edge with as-of date."),
  unavailable("shot quality", "Unblocked shot / xG models. Not ESPN SOG on the card."),
  unavailable("special teams", "PP/PK% as-of. Not on current GameCard."),
  { feature: "goalie quality / confirmation", currentlyAvailable: "partial", currentSource: "ESPN probable starter (name/savePct when present)", reliability: "low", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: true, recommendedFutureSource: "Confirmed starter + sv% as-of. Unconfirmed goalie is missing, not assumed." },
  unavailable("possession", "Corsi/xGF. Not ESPN."),
];

const ncaabExtra: YachtDataSourceRow[] = [
  unavailable("efficiency ratings", "KenPom / Barttorvik as-of. Not licensed here — leave missing."),
  unavailable("tempo", "Possessions/game from a dated efficiency feed."),
  unavailable("shot profile", "3PA rate / rim rate. Not ESPN."),
  unavailable("rebounding", "OR% / DR% as-of."),
  unavailable("turnovers", "TOV% as-of."),
];

const ufcMatrix: YachtDataSourceRow[] = [
  ...SHARED_MARKET_MATRIX,
  { feature: "fighter identity", currentlyAvailable: "yes", currentSource: "ESPN fight card names", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Keep ESPN names." },
  unavailable("opponent-adjusted striking", "UFC stats striking with opponent adjustment. Not ESPN."),
  unavailable("grappling", "TD acc / TD def / control time as-of."),
  unavailable("age / reach", "UFC fighter bio with known_at."),
  unavailable("takedown defense", "UFC stats TD def as-of."),
  unavailable("layoffs", "Days since last fight from prior UFC cards (possible later from historical_games)."),
  unavailable("weight-class context", "Division + cut notes. Not on current GameCard."),
];

function ufcHistorical(ctx: YachtHistContext): YachtFeature[] {
  const openKnown = ctx.pregame.openCapturedAt;
  return [
    makeFeature({ key: "red_name", value: ctx.game.homeTeam, source: "espn-fight-card", knownAt: null, capturedAt: null, predictionAt: ctx.predictionAt, quality: 0 }),
    makeFeature({ key: "blue_name", value: ctx.game.awayTeam, source: "espn-fight-card", knownAt: null, capturedAt: null, predictionAt: ctx.predictionAt, quality: 0 }),
    makeFeature({ key: "home_open_ml", value: ctx.pregame.homeOpen, source: ctx.pregame.sportsbook, knownAt: openKnown, capturedAt: openKnown, predictionAt: ctx.predictionAt, quality: openKnown ? 1 : 0 }),
    makeFeature({ key: "away_open_ml", value: ctx.pregame.awayOpen, source: ctx.pregame.sportsbook, knownAt: openKnown, capturedAt: openKnown, predictionAt: ctx.predictionAt, quality: openKnown ? 1 : 0 }),
    ...missingPlaceholders(ufcMatrix, ctx.predictionAt),
  ];
}

function ufcLive(ctx: YachtLiveContext): YachtFeature[] {
  const boardAt = ctx.game.fetchedAt ?? null;
  return [
    makeFeature({ key: "red_name", value: ctx.game.home.name, source: "espn-fight-card", knownAt: boardAt, capturedAt: boardAt, predictionAt: ctx.predictionAt, quality: boardAt ? 1 : 0 }),
    makeFeature({ key: "blue_name", value: ctx.game.away.name, source: "espn-fight-card", knownAt: boardAt, capturedAt: boardAt, predictionAt: ctx.predictionAt, quality: boardAt ? 1 : 0 }),
    ...missingPlaceholders(ufcMatrix, ctx.predictionAt),
  ];
}

const ufc: SportFeatureProvider = {
  sport: "ufc",
  displayName: "UFC",
  family: "fight",
  minPrior: 1,
  priorCompleteMs: 0.5 * HOUR,
  contractVersion: yachtVersion("ufc"),
  datasetName: "Model Yacht UFC Dataset v1",
  notes: ["Fight adapter. No baseball/team-form assumptions. Advanced fighter stats are missing."],
  matrix: ufcMatrix,
  historicalFeatures: ufcHistorical,
  liveFeatures: ufcLive,
};

const nfl: SportFeatureProvider = teamProvider({
  sport: "nfl",
  displayName: "NFL",
  minPrior: 4,
  priorCompleteMs: 4 * HOUR,
  extra: nflExtra,
  notes: [
    "Football adapter. EPA/QB EPA/CPOE/line/pace are typed gaps, not invented.",
    "Deep challenger is shadow-only: model-yacht-nfl-*-2026.09.2. V2 remains champion.",
  ],
  historical: (ctx) => [...nflHistoricalFeatures(ctx), ...missingPlaceholders(YACHT_NFL_DATA_MATRIX, ctx.predictionAt)],
  live: (ctx) => [...nflLiveFeatures(ctx), ...missingPlaceholders(YACHT_NFL_DATA_MATRIX, ctx.predictionAt)],
});

const providers: SportFeatureProvider[] = [
  mlb,
  nfl,
  teamProvider({ sport: "ncaaf", displayName: "NCAAF", minPrior: 4, priorCompleteMs: 4 * HOUR, extra: nflExtra, notes: ["College football shares the football gap list. No NFL-only stats invented for NCAA."] }),
  teamProvider({ sport: "nba", displayName: "NBA", minPrior: 10, priorCompleteMs: 2.5 * HOUR, extra: nbaExtra, notes: ["Hoops adapter. Ratings/lineups/minutes restrictions are missing."] }),
  teamProvider({ sport: "wnba", displayName: "WNBA", minPrior: 8, priorCompleteMs: 2.5 * HOUR, extra: nbaExtra, notes: ["WNBA uses the hoops gap list. Independent model version from NBA."] }),
  teamProvider({ sport: "nhl", displayName: "NHL", minPrior: 10, priorCompleteMs: 2.5 * HOUR, extra: nhlExtra, notes: ["Hockey adapter. xG/goalie confirmation stay missing until dated sources exist."] }),
  teamProvider({ sport: "ncaab", displayName: "NCAAB", minPrior: 8, priorCompleteMs: 2.5 * HOUR, extra: ncaabExtra, notes: ["College hoops. KenPom-class ratings are not in-repo — leave missing."] }),
  ufc,
];

for (const p of providers) registerYachtProvider(p);

export function allYachtProviders(): SportFeatureProvider[] {
  return providers;
}

export function allSportsMatrix(): Array<YachtDataSourceRow & { sport: YachtSport }> {
  return providers.flatMap((p) => p.matrix.map((row) => ({ ...row, sport: p.sport })));
}
