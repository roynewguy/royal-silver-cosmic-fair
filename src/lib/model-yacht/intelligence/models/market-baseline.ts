import { clampProb } from "../../../models-v3/logreg.ts";
import type { MarketBaseline } from "../market.ts";

/** Sportsbook no-vig is a candidate, not a feature unless the engine opts in. */
export function predictMarketBaseline(baseline: MarketBaseline | null): number | null {
  if (!baseline) return null;
  return clampProb(baseline.noVigHome);
}
