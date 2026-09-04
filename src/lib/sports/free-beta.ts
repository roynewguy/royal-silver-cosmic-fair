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

export const MAX_OFFICIAL_DK_CACHE_AGE_MINUTES = 20;
export const MAX_OFFICIAL_DK_CACHE_AGE_MS = MAX_OFFICIAL_DK_CACHE_AGE_MINUTES * 60_000;

export function isFreshOfficialDkCache(cacheAgeMs: number | null | undefined): boolean {
  return cacheAgeMs != null && cacheAgeMs >= 0 && cacheAgeMs <= MAX_OFFICIAL_DK_CACHE_AGE_MS;
}

export type OfficialDkAction = "use-cache" | "fetch" | "pass";

export function officialDkAction(input: {
  remaining: number | null;
  cacheAgeMs: number | null;
  cachedIsDk: boolean;
  checksAlready?: number;
}): OfficialDkAction {
  const fresh = input.cachedIsDk && isFreshOfficialDkCache(input.cacheAgeMs);
  if (fresh) return "use-cache";
  const spend = canSpendOddsCredit({
    remaining: input.remaining,
    checksAlready: input.checksAlready ?? 0,
    cacheAgeMs: null,
  });
  if (spend.fetch) return "fetch";
  return "pass";
}

/**
 * Hard official-post rule: stored cache may live for history, but a stale DK
 * line cannot freeze a ticket. Failed refresh + stale cache = PASS.
 */
export function officialLineDecision(input: {
  remaining: number | null;
  cacheAgeMs: number | null;
  cachedIsDk: boolean;
  checksAlready?: number;
  fetchOk?: boolean;
}): OfficialDkAction {
  const action = officialDkAction(input);
  if (action === "use-cache") {
    return isFreshOfficialDkCache(input.cacheAgeMs) && input.cachedIsDk ? "use-cache" : "pass";
  }
  if (action === "fetch") {
    if (input.fetchOk) return "fetch";
    if (input.fetchOk === false) return "pass";
    return "fetch";
  }
  return "pass";
}

export function canSpendOddsCredit(input: {
  remaining: number | null;
  checksAlready: number;
  cacheAgeMs: number | null;
}): { fetch: boolean; reason: string } {
  const budget = oddsBudget(input.remaining);
  if (budget === "frozen") return { fetch: false, reason: "Odds API credits exhausted." };
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
