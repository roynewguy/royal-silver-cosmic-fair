import type { GameCard, Injury, Starter } from "./types.ts";

export type ModelInputs = {
  homeSplit: string | null;
  roadSplit: string | null;
  awayHomeSplit: string | null;
  awayRoadSplit: string | null;
  homeStarter: Starter | null;
  awayStarter: Starter | null;
  injuries: Injury[];
  weather: string | null;
  notes: string[];
  modelVersion: string | null;
  capturedAt: string;
  clock?: string | null;
  period?: number | null;
  shortDetail?: string | null;
  fetchedAt?: string | null;
  injuriesFetchedAt?: string | null;
};

export function packModelInputs(game: GameCard): ModelInputs {
  return {
    homeSplit: game.home.homeSplit,
    roadSplit: game.home.roadSplit,
    awayHomeSplit: game.away.homeSplit,
    awayRoadSplit: game.away.roadSplit,
    homeStarter: game.home.starter,
    awayStarter: game.away.starter,
    injuries: game.injuries ?? [],
    weather: game.weather,
    notes: game.notes ?? [],
    modelVersion: game.rank?.model ?? null,
    capturedAt: game.fetchedAt ?? game.odds?.capturedAt ?? game.injuriesFetchedAt ?? "",
    clock: game.clock ?? null,
    period: game.period ?? null,
    shortDetail: game.shortDetail ?? null,
    fetchedAt: game.fetchedAt ?? null,
    injuriesFetchedAt: game.injuriesFetchedAt ?? null,
  };
}

export function applyModelInputs(game: GameCard, raw: unknown): GameCard {
  if (!raw || typeof raw !== "object") return game;
  const m = raw as Partial<ModelInputs>;
  return {
    ...game,
    notes: Array.isArray(m.notes) ? m.notes : game.notes,
    injuries: Array.isArray(m.injuries) ? m.injuries : game.injuries,
    weather: m.weather ?? game.weather,
    clock: m.clock ?? game.clock ?? null,
    period: m.period ?? game.period ?? null,
    shortDetail: m.shortDetail ?? game.shortDetail ?? null,
    fetchedAt: m.fetchedAt ?? game.fetchedAt ?? null,
    injuriesFetchedAt: m.injuriesFetchedAt ?? game.injuriesFetchedAt ?? null,
    home: {
      ...game.home,
      homeSplit: m.homeSplit ?? game.home.homeSplit,
      roadSplit: m.roadSplit ?? game.home.roadSplit,
      starter: m.homeStarter ?? game.home.starter,
    },
    away: {
      ...game.away,
      homeSplit: m.awayHomeSplit ?? game.away.homeSplit,
      roadSplit: m.awayRoadSplit ?? game.away.roadSplit,
      starter: m.awayStarter ?? game.away.starter,
    },
  };
}
