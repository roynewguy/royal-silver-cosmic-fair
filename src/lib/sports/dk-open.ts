import type { OddsSnapshot } from "./types.ts";

export function applyDraftKingsSnapshot(prev: OddsSnapshot, snap: OddsSnapshot): OddsSnapshot {
  const keepOpen = prev.source === "odds-api";
  return {
    ...snap,
    openHomeSpread: keepOpen && prev.openHomeSpread != null ? prev.openHomeSpread : snap.homeSpread,
    openHomeMl: keepOpen && prev.openHomeMl != null ? prev.openHomeMl : snap.homeMl,
    openTotal: keepOpen && prev.openTotal != null ? prev.openTotal : snap.total,
  };
}

export function shouldFetchLeagueOdds(input: {
  scheduledCount: number;
  hoursToKick: number | null;
  lastFetchAgeMs: number;
}): boolean {
  if (input.scheduledCount <= 0) return false;
  const hours = input.hoursToKick;
  if (hours == null) return false;
  if (hours < 0) return false;
  const age = input.lastFetchAgeMs;
  if (hours <= 3) return age >= 8 * 60_000;
  if (hours <= 6) return age >= 15 * 60_000;
  return age >= 45 * 60_000;
}

export function nearestKickHours(starts: string[], now = Date.now()): number | null {
  let best: number | null = null;
  for (const start of starts) {
    const t = new Date(start).getTime();
    if (Number.isNaN(t)) continue;
    const hours = (t - now) / 3_600_000;
    if (best == null || hours < best) best = hours;
  }
  return best;
}
