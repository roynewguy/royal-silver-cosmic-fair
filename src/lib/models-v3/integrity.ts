/** Audit of the published MLB V3 backtest. Not a production contract. */

export const BACKTEST_AUDIT = {
  sportsbook: "ESPN BET via ESPN core odds (unofficial). Not verified DraftKings.",
  priceUsedForStake:
    "FIXED: stake is opener only. The published +22% ROI used homeOpen ?? homeClose, so missing openers were bet at the closer. That path is gone — missing pregame price drops the bet from ROI. Close is CLV-only.",
  closerSemantics: "ESPN close is the last listed ESPN BET number, not a guaranteed last-tick-before-first-pitch DK close.",
  vig: "Legacy edge2/3/5 still compare model probability to raw American implied (no de-vig) and can mint fake ROI. honestBacktest / Model Yacht de-vig both sides.",
  missingOdds: "Games without a two-way pregame moneyline are dropped from ROI. Undifferentiated ESPN moneyLine is not treated as an opener.",
  starterEra: "Historical ERA is ESPN probable-pitcher season ERA on the scoreboard dump. Historical pulls are usually the final-day payload, so ERA is NOT proven point-in-time pregame. Flagged leak risk. Live shadow uses the current probable ERA instead.",
  last5Last10RdiffRest: "These are rebuilt from prior finals only and are leak-safe when priors exist.",
  calibration: "The 70%+ bucket was badly overconfident on the original test set. Do not promote from ROI alone.",
  honestRule: "Honest backtest requires both opening moneylines, uses de-vigged implied probability, and never bets the closer.",
  oneSidedHelper: "Removed unused backtest() — it staked the away side at the home price.",
} as const;

export const CANONICAL_LEAD_MS = 180 * 60_000;

export function inCanonicalWindow(startAt: string, now = Date.now(), leadMs = CANONICAL_LEAD_MS): boolean {
  const start = new Date(startAt).getTime();
  if (!Number.isFinite(start)) return false;
  return now >= start - leadMs && now < start;
}
