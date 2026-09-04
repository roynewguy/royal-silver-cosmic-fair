import type { Market } from "./types.ts";

export type OddsBudget = "normal" | "final-only" | "one-shot" | "frozen";

export function isFreeBetaMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.FREE_BETA_MODE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export function oddsBudget(remaining: number | null | undefined): OddsBudget {
  if (remaining == null) return "normal";
  if (remaining <= 0) return "frozen";
  if (remaining < 50) return "one-shot";
  if (remaining <= 150) return "final-only";
  return "normal";
}

export function marketParam(market: Market): "h2h" | "spreads" | "totals" {
  if (market === "moneyline") return "h2h";
  if (market === "total") return "totals";
  return "spreads";
}

export function canSpendOddsCredit(input: {
  remaining: number | null;
  checksAlready: number;
  cacheAgeMs: number | null;
}): { fetch: boolean; reason: string } {
  const budget = oddsBudget(input.remaining);
  if (budget === "frozen") return { fetch: false, reason: "Odds API credits exhausted. Using cached DraftKings only." };
  if (input.checksAlready >= 2) return { fetch: false, reason: "Candidate already used two DraftKings checks." };
  if (input.cacheAgeMs != null && input.cacheAgeMs < 3 * 60_000) {
    return { fetch: false, reason: "Fresh DraftKings cache." };
  }
  if (budget === "one-shot" && input.checksAlready >= 1) {
    return { fetch: false, reason: "Low credits: one DraftKings check already used." };
  }
  if (budget === "final-only" && input.checksAlready >= 1 && input.cacheAgeMs != null && input.cacheAgeMs < 20 * 60_000) {
    return { fetch: false, reason: "Final-check-only: cached DraftKings is recent." };
  }
  return { fetch: true, reason: "fetch" };
}
