import { MAX_OFFICIAL_DK_CACHE_AGE_MS } from "./free-beta.ts";
import type { GameCard } from "./types.ts";

export type FreshnessStatus = "fresh" | "stale" | "missing";

export type FieldFreshness = {
  source: string;
  capturedAt: string | null;
  ageMinutes: number | null;
  freshnessStatus: FreshnessStatus;
};

export const TTL_MS = {
  marketOfficial: MAX_OFFICIAL_DK_CACHE_AGE_MS,
  schedule: 30 * 60_000,
  starter: 180 * 60_000,
  injury: 180 * 60_000,
  weather: 180 * 60_000,
  team: 24 * 3600_000,
} as const;

export function stamp(source: string, capturedAt: string | null | undefined, maxAgeMs: number, now = Date.now()): FieldFreshness {
  if (!capturedAt) return { source, capturedAt: null, ageMinutes: null, freshnessStatus: "missing" };
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return { source, capturedAt, ageMinutes: null, freshnessStatus: "missing" };
  const age = Math.max(0, now - t);
  return {
    source,
    capturedAt,
    ageMinutes: Math.round(age / 60_000),
    freshnessStatus: age <= maxAgeMs ? "fresh" : "stale",
  };
}

export function gameFreshness(game: GameCard, now = Date.now()): Record<string, FieldFreshness> {
  return {
    schedule: stamp("espn", game.startAt, TTL_MS.schedule, now),
    market: stamp(game.odds.book || game.odds.source, game.odds.capturedAt, TTL_MS.marketOfficial, now),
    starter: stamp("espn-probable", game.home.starter?.name || game.away.starter?.name ? game.fetchedAt ?? null : null, TTL_MS.starter, now),
    injuries: stamp("espn-injury", game.injuriesFetchedAt ?? ((game.injuries?.length ?? 0) > 0 ? game.fetchedAt ?? null : null), TTL_MS.injury, now),
    weather: stamp("espn-weather", game.weather ? game.fetchedAt ?? null : null, TTL_MS.weather, now),
    team: stamp("espn-record", game.home.record ? game.fetchedAt ?? null : null, TTL_MS.team, now),
  };
}
