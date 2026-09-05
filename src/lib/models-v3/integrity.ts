/** Audit of the published MLB V3 backtest. Not a production contract. */

export const BACKTEST_AUDIT = {
  sportsbook: "ESPN BET via ESPN core odds (unofficial). Not verified DraftKings.",
  priceUsedForStake: "Published +22% ROI used homeOpen ?? homeClose. If opener was missing, the closer was used as the bet price. That is not a live betting timestamp.",
  closerSemantics: "ESPN close is the last listed ESPN BET number, not a guaranteed last-tick-before-first-pitch DK close.",
  vig: "Published ROI compared model probability to raw American implied probability (no de-vig). That inflates edge and can mint fake ROI.",
  missingOdds: "Games without a two-way moneyline were skipped in the side backtest, but stake fallback to close still leaked.",
  starterEra: "Historical ERA is ESPN probable-pitcher season ERA on the scoreboard dump. Historical pulls are usually the final-day payload, so ERA is NOT proven point-in-time pregame. Flagged leak risk. Live shadow uses the current probable ERA instead.",
  last5Last10RdiffRest: "These are rebuilt from prior finals only and are leak-safe when priors exist.",
  calibration: "The 70%+ bucket was badly overconfident on the original test set. Do not promote from ROI alone.",
  honestRule: "Honest backtest requires both opening moneylines, uses de-vigged implied probability, and never bets the closer.",
} as const;

export const CANONICAL_LEAD_MS = 180 * 60_000;

export function inCanonicalWindow(startAt: string, now = Date.now(), leadMs = CANONICAL_LEAD_MS): boolean {
  const start = new Date(startAt).getTime();
  if (!Number.isFinite(start)) return false;
  return now >= start - leadMs && now < start;
}
