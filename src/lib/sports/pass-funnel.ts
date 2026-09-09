import { isPlayableRank, isSoftFloorEligibleRank } from "./data-quality.ts";
import { liveSlateGames } from "./rank.ts";
import type { GameCard, PassReason } from "./types.ts";

/** Slate-level PASS codes (desk funnel). Includes per-ticket PassReason plus board empties. */
export type SlatePassCode =
  | PassReason
  | "PASS_EMPTY_SLATE"
  | "PASS_NO_RANK"
  | "PASS_NO_LOCK";

export type PassReasonCount = { code: SlatePassCode; count: number };

export type SlatePassSummary = {
  scanned: number;
  locks: number;
  softResearch: number;
  /** Dominant / primary PASS code for zero-LOCK slate. */
  primary: Exclude<SlatePassCode, "PASS_NO_LOCK"> | "PASS_NO_LOCK";
  reasons: PassReasonCount[];
};

/**
 * Why this ranked ticket is not a hard LOCK.
 * Prefer stamped passReason; otherwise derive edge/conf from live thresholds.
 */
export function lockGatePassCode(
  rank: {
    edgePct: number;
    confidence?: number;
    passReason?: string | null;
  } | null | undefined,
  minEdge: number,
  minConf: number,
): SlatePassCode | null {
  if (!rank) return "PASS_NO_RANK";
  if (isPlayableRank(rank, minEdge, minConf)) return null;
  if (rank.passReason) return rank.passReason as PassReason;
  if (rank.edgePct < minEdge) return "PASS_EDGE_TOO_SMALL";
  if ((rank.confidence ?? minConf) < minConf) return "PASS_LOW_CONFIDENCE";
  return "PASS_NO_LOCK";
}

/** Aggregate SCAN→RANK→LOCK_GATE→PASS reasons for a zero-LOCK (or any) slate. Soft never counts as LOCK. */
export function summarizeSlatePass(
  games: GameCard[],
  minEdge = 3,
  minConf = 58,
  now = new Date(),
): SlatePassSummary {
  const pool = liveSlateGames(games, now);
  const scanned = pool.length;
  const counts = new Map<SlatePassCode, number>();
  let locks = 0;
  let softResearch = 0;

  for (const g of pool) {
    const code = lockGatePassCode(g.rank, minEdge, minConf);
    if (code == null) {
      locks += 1;
      continue;
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
    if (isSoftFloorEligibleRank(g.rank) && !isPlayableRank(g.rank, minEdge, minConf)) {
      softResearch += 1;
    }
  }

  const reasons = [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  let primary: SlatePassSummary["primary"];
  if (scanned === 0) primary = "PASS_EMPTY_SLATE";
  else if (locks === 0 && reasons[0]) primary = reasons[0].code;
  else primary = "PASS_NO_LOCK";

  return { scanned, locks, softResearch, primary, reasons };
}

/**
 * Desk-visible funnel line. Soft/DESK is research-only — never implies a queued Discord ticket.
 * Example: SCAN→RANK→LOCK_GATE→PASS_EDGE_TOO_SMALL · scanned 40 · locks 0 · soft_research 6 (never queued) · PASS_EDGE_TOO_SMALL×18 · PASS_LOW_CONFIDENCE×9
 */
export function formatPassFunnelLog(summary: SlatePassSummary, target: number): string {
  const reasonPart =
    summary.reasons.length === 0
      ? summary.primary
      : summary.reasons.map((r) => `${r.code}×${r.count}`).join(" · ");
  return (
    `SCAN→RANK→LOCK_GATE→${summary.primary}` +
    ` · scanned ${summary.scanned}` +
    ` · locks ${summary.locks}` +
    ` · soft_research ${summary.softResearch} (never queued)` +
    ` · target ${target} max` +
    ` · ${reasonPart}`
  );
}
