import type { OddsSnapshot } from "./types.ts";
export {
  nearestKickHours,
  shouldFetchLeagueOdds,
} from "./odds-poll.ts";

export function applyDraftKingsSnapshot(prev: OddsSnapshot, snap: OddsSnapshot): OddsSnapshot {
  const keepOpen = prev.source === "odds-api";
  return {
    ...snap,
    openHomeSpread: keepOpen && prev.openHomeSpread != null ? prev.openHomeSpread : snap.homeSpread,
    openHomeMl: keepOpen && prev.openHomeMl != null ? prev.openHomeMl : snap.homeMl,
    openTotal: keepOpen && prev.openTotal != null ? prev.openTotal : snap.total,
  };
}
