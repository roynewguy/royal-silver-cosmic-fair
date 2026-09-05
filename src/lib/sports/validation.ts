import type { GameCard, RankPick } from "./types.ts";

export const EDGE_OUTLIER_PCT = 12;
export const STABILITY_PROB_DELTA = 0.05;

export type FeatureStamp = { ageMinutes: number | null; source: string };

export type StabilityReport = {
  probabilityChange: number;
  edgeChange: number;
  confidenceChange: number;
  meaningfulInputChange: string[];
  flag: "UNSTABLE_MODEL_OUTPUT" | null;
};

export function featureFreshness(game: GameCard, now = Date.now()): Record<string, FeatureStamp> {
  const age = (iso: string | null | undefined, source: string): FeatureStamp => {
    if (!iso) return { ageMinutes: null, source };
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return { ageMinutes: null, source };
    return { ageMinutes: Math.max(0, Math.round((now - t) / 60_000)), source };
  };
  return {
    market: age(game.odds.capturedAt, game.odds.book || game.odds.source),
    starter: age(game.home.starter?.name || game.away.starter?.name ? game.fetchedAt ?? null : null, "espn-probable"),
    injuries: age(game.injuriesFetchedAt ?? ((game.injuries?.length ?? 0) > 0 ? game.fetchedAt ?? null : null), "espn-injury"),
    weather: age(game.weather ? game.fetchedAt ?? null : null, game.weather ? "espn-weather" : "none"),
    team: age(game.home.record ? game.fetchedAt ?? null : null, "espn-record"),
  };
}

export function hasConfirmedInjuryShock(game: GameCard): boolean {
  return (game.injuries ?? []).some((i) => i.status === "out" || i.status === "doubtful");
}

export function hasMarketDislocation(game: GameCard): boolean {
  const open = game.odds.openHomeMl;
  const now = game.odds.homeMl;
  if (open == null || now == null) return false;
  return Math.abs(open - now) >= 20;
}

export function edgeOutlierReason(game: GameCard, edgePct: number): string | null {
  if (edgePct < EDGE_OUTLIER_PCT) return null;
  if (hasConfirmedInjuryShock(game)) return "major confirmed injury";
  if (hasMarketDislocation(game)) return "market dislocation";
  if (!game.home.starter?.name || !game.away.starter?.name) return "starter change";
  return null;
}

export function shouldFlagEdgeOutlier(game: GameCard, edgePct: number): boolean {
  return edgePct >= EDGE_OUTLIER_PCT && edgeOutlierReason(game, edgePct) == null;
}

export function meaningfulInputDiff(prev: GameCard, next: GameCard): string[] {
  const reasons: string[] = [];
  const starter = (g: GameCard) => `${g.home.starter?.name ?? ""}|${g.away.starter?.name ?? ""}`;
  if (starter(prev) !== starter(next)) reasons.push("starter change");
  const outs = (g: GameCard) =>
    (g.injuries ?? [])
      .filter((i) => i.status === "out")
      .map((i) => i.player)
      .sort()
      .join(",");
  if (outs(prev) !== outs(next)) reasons.push("major confirmed injury");
  if ((prev.weather ?? "") !== (next.weather ?? "")) reasons.push("weather");
  const ml = (g: GameCard) => `${g.odds.homeMl ?? ""}|${g.odds.awayMl ?? ""}`;
  if (ml(prev) !== ml(next)) reasons.push("market dislocation");
  return reasons;
}

export function stabilityReport(
  prev: RankPick | null,
  next: RankPick,
  inputChanges: string[],
  threshold = STABILITY_PROB_DELTA,
): StabilityReport {
  const probabilityChange = prev ? next.probability - prev.probability : 0;
  const edgeChange = prev ? next.edgePct - prev.edgePct : 0;
  const confidenceChange = prev ? next.confidence - prev.confidence : 0;
  const flag =
    prev != null && Math.abs(probabilityChange) > threshold && inputChanges.length === 0
      ? "UNSTABLE_MODEL_OUTPUT"
      : null;
  return { probabilityChange, edgeChange, confidenceChange, meaningfulInputChange: inputChanges, flag };
}

export function asOfTimestamp<T extends { capturedAt?: string | null; generatedAt?: string | null }>(
  rows: T[],
  simTimeMs: number,
): T[] {
  return rows.filter((row) => {
    const raw = row.capturedAt ?? row.generatedAt;
    if (!raw) return false;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) && t <= simTimeMs;
  });
}
