import { impliedFromAmerican } from "../../../../sports/odds.ts";
import type { GameCard } from "../../../../sports/types.ts";
import { makeFeature, provenPregameTwoWay, type YachtFeature, type YachtMarketSnapshot } from "../../../core/provenance.ts";
import { sharedHistoricalForm, sharedLiveCardFeatures } from "../../../shared.ts";
import type { YachtHistContext, YachtLiveContext } from "../../../provider.ts";
import { nflInjuryWeights } from "./injuries.ts";
import { parseNflWeather } from "./situational.ts";

function sourceTime(field: string | null | undefined): string | null {
  return field ?? null;
}

export function nflHistoricalFeatures(ctx: YachtHistContext): YachtFeature[] {
  const base = sharedHistoricalForm(ctx, { scoreDiffHome: "home_point_diff_pg", scoreDiffAway: "away_point_diff_pg" });
  const { predictionAt } = ctx;
  return [
    ...base,
    makeFeature({ key: "qb_out_home", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
    makeFeature({ key: "qb_out_away", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
    makeFeature({ key: "epa_off", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
    makeFeature({ key: "cpoe", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
  ];
}

export function nflLiveFeatures(ctx: YachtLiveContext): YachtFeature[] {
  const { game, predictionAt } = ctx;
  const boardAt = sourceTime(game.fetchedAt);
  const weatherAt = sourceTime(game.weatherFetchedAt);
  const injuryAt = sourceTime(game.injuriesFetchedAt);
  const oddsAt = sourceTime(game.odds.capturedAt);
  const wx = parseNflWeather(game.weather);
  const inj = nflInjuryWeights(game.injuries ?? []);
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
  const proven = provenPregameTwoWay(market, predictionAt);
  const currentNoVig =
    proven && proven.kind === "current"
      ? impliedFromAmerican(proven.home) / (impliedFromAmerican(proven.home) + impliedFromAmerican(proven.away))
      : null;
  const openNoVig =
    proven && proven.kind === "open"
      ? impliedFromAmerican(proven.home) / (impliedFromAmerican(proven.home) + impliedFromAmerican(proven.away))
      : null;
  const skillHome = inj.byGroupHome.wr + inj.byGroupHome.te + inj.byGroupHome.rb;
  const skillAway = inj.byGroupAway.wr + inj.byGroupAway.te + inj.byGroupAway.rb;
  const defHome = inj.byGroupHome.dl + inj.byGroupHome.lb + inj.byGroupHome.db;
  const defAway = inj.byGroupAway.dl + inj.byGroupAway.lb + inj.byGroupAway.db;

  return [
    ...sharedLiveCardFeatures(ctx),
    makeFeature({ key: "qb_out_home", value: inj.qbOutHome, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.85 : 0 }),
    makeFeature({ key: "qb_out_away", value: inj.qbOutAway, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.85 : 0 }),
    makeFeature({ key: "qb_doubt_home", value: inj.qbDoubtHome, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.85 : 0 }),
    makeFeature({ key: "qb_doubt_away", value: inj.qbDoubtAway, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.85 : 0 }),
    makeFeature({ key: "ol_injury_delta", value: inj.byGroupAway.ol - inj.byGroupHome.ol, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.7 : 0 }),
    makeFeature({ key: "skill_injury_delta", value: skillAway - skillHome, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.7 : 0 }),
    makeFeature({ key: "def_injury_delta", value: defAway - defHome, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.7 : 0 }),
    makeFeature({ key: "injury_away_minus_home", value: inj.deltaAwayMinusHome, source: "espn-injury-board", knownAt: injuryAt, capturedAt: injuryAt, predictionAt, quality: injuryAt ? 0.75 : 0 }),
    makeFeature({ key: "wind_mph", value: wx.windMph, source: "espn-weather", knownAt: weatherAt, capturedAt: weatherAt, predictionAt, quality: wx.windMph != null && weatherAt ? 0.6 : 0 }),
    makeFeature({ key: "precip", value: wx.precip, source: "espn-weather", knownAt: weatherAt, capturedAt: weatherAt, predictionAt, quality: wx.precip != null && weatherAt ? 0.55 : 0 }),
    makeFeature({ key: "temperature", value: wx.temperature, source: "espn-weather", knownAt: weatherAt, capturedAt: weatherAt, predictionAt, quality: wx.temperature != null && weatherAt ? 0.55 : 0 }),
    makeFeature({ key: "dome", value: wx.dome, source: "espn-weather", knownAt: weatherAt, capturedAt: weatherAt, predictionAt, quality: wx.dome != null && weatherAt ? 0.55 : 0 }),
    makeFeature({ key: "spread_home", value: game.odds.homeSpread, source: game.odds.book, knownAt: oddsAt, capturedAt: oddsAt, predictionAt, quality: game.odds.homeSpread != null && oddsAt ? 0.8 : 0 }),
    makeFeature({ key: "total", value: game.odds.total, source: game.odds.book, knownAt: oddsAt, capturedAt: oddsAt, predictionAt, quality: game.odds.total != null && oddsAt ? 0.8 : 0 }),
    makeFeature({ key: "current_no_vig_home", value: currentNoVig, source: game.odds.book, knownAt: proven?.capturedAt ?? null, capturedAt: proven?.capturedAt ?? null, predictionAt, quality: currentNoVig != null ? 1 : 0 }),
    makeFeature({ key: "open_no_vig_home", value: openNoVig, source: game.odds.book, knownAt: proven?.capturedAt ?? null, capturedAt: proven?.capturedAt ?? null, predictionAt, quality: openNoVig != null ? 1 : 0 }),
    makeFeature({ key: "epa_off", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
    makeFeature({ key: "cpoe", value: null, source: "none", knownAt: null, capturedAt: null, predictionAt, missing: true, quality: 0 }),
    makeFeature({ key: "home_field", value: 1, source: "fixture", knownAt: boardAt, capturedAt: boardAt, predictionAt, quality: boardAt ? 1 : 0 }),
  ];
}

export function nflLiveCard(game: GameCard, predictionAt: string): YachtFeature[] {
  return nflLiveFeatures({ game, predictionAt });
}
