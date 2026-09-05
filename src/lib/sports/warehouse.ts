import { impliedFromAmerican } from "./odds.ts";
import type { GameCard, RankPick } from "./types.ts";

export type PregameFeatures = {
  knownBeforeStart: true;
  capturedAt: string;
  homeRecord: string | null;
  awayRecord: string | null;
  homeSplit: string | null;
  homeRoadSplit: string | null;
  awaySplit: string | null;
  awayRoadSplit: string | null;
  homeStarter: { name: string; era: number | null; whip: number | null; savePct: number | null } | null;
  awayStarter: { name: string; era: number | null; whip: number | null; savePct: number | null } | null;
  homeOut: number;
  awayOut: number;
  weather: string | null;
  restDaysHome: null;
  restDaysAway: null;
  book: string;
  oddsSource: string;
  homeMl: number | null;
  awayMl: number | null;
  homeSpread: number | null;
  total: number | null;
};

function starterBits(s: GameCard["home"]["starter"]) {
  if (!s?.name) return null;
  return { name: s.name, era: s.era, whip: s.whip, savePct: s.savePct };
}

/** Only information that could have been known before first pitch/tip. Scores never go here. */
export function packPregameFeatures(game: GameCard, now = Date.now()): PregameFeatures | null {
  const start = new Date(game.startAt).getTime();
  if (!Number.isFinite(start) || start <= now) return null;
  if (game.status !== "scheduled") return null;
  const injuries = game.injuries ?? [];
  return {
    knownBeforeStart: true,
    capturedAt: new Date(now).toISOString(),
    homeRecord: game.home.record,
    awayRecord: game.away.record,
    homeSplit: game.home.homeSplit,
    homeRoadSplit: game.home.roadSplit,
    awaySplit: game.away.homeSplit,
    awayRoadSplit: game.away.roadSplit,
    homeStarter: starterBits(game.home.starter),
    awayStarter: starterBits(game.away.starter),
    homeOut: injuries.filter((i) => i.team === "home" && i.status === "out").length,
    awayOut: injuries.filter((i) => i.team === "away" && i.status === "out").length,
    weather: game.weather,
    restDaysHome: null,
    restDaysAway: null,
    book: game.odds.book,
    oddsSource: game.odds.source,
    homeMl: game.odds.homeMl,
    awayMl: game.odds.awayMl,
    homeSpread: game.odds.homeSpread,
    total: game.odds.total,
  };
}

export function marketImplied(rank: RankPick): number | null {
  const p = rank.price;
  if (p == null || !Number.isFinite(p)) return null;
  return impliedFromAmerican(p);
}

