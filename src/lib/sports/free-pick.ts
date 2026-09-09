import { resolvePickTier } from "./discord.ts";
import type { PickRow } from "./types.ts";

export const DEFAULT_DAILY_FREE_PICKS = 1;
export const MAX_DAILY_FREE_PICKS = 1;

/** Max 1 free Discord post per PT day. 0 disables. */
export function dailyFreePickTarget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DAILY_FREE_PICK_TARGET?.trim();
  if (raw == null || raw === "") return DEFAULT_DAILY_FREE_PICKS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_FREE_PICKS;
  return Math.min(MAX_DAILY_FREE_PICKS, Math.max(0, Math.round(n)));
}

export type FreePickCandidate = {
  id: number;
  status: string;
  edgePct: number;
  tier: "lock" | "soft_floor";
};

function byEdgeThenId(a: FreePickCandidate, b: FreePickCandidate): number {
  if (b.edgePct !== a.edgePct) return b.edgePct - a.edgePct;
  return a.id - b.id;
}

function isDeliverable(status: string): boolean {
  return status === "posted" || status === "graded";
}

/**
 * FREE channel mirrors official truth gate: LOCK only.
 * DAILY_FREE_PICK_TARGET is a max (0/1) — never a floor that invents or promotes DESK.
 * Waits while a LOCK is still on the card but not yet VIP-posted.
 * Soft/DESK never forces a free Discord post and never wins a LOCK badge.
 */
export function selectFreePickOfDay(candidates: FreePickCandidate[]): FreePickCandidate | null {
  if (!candidates.length) return null;
  const locks = candidates.filter((c) => c.tier === "lock").sort(byEdgeThenId);
  if (!locks.length) return null;
  const best = locks[0]!;
  return isDeliverable(best.status) ? best : null;
}

export function freeCandidatesFromOfficial(picks: PickRow[]): FreePickCandidate[] {
  return picks.map((p) => ({
    id: p.id,
    status: p.status,
    edgePct: Number.isFinite(p.edgePct) ? p.edgePct : 0,
    tier: resolvePickTier(p),
  }));
}
