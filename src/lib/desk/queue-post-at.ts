import type { PickTier } from "@/lib/sports/types";

const MIN_OFFICIAL_LEAD_MINUTES = 60;

function postAtFor(startAt: string, leadMinutes: number): string {
  return new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
}

/**
 * Legacy soft_floor (research-only; expired before flush) may post immediately if present.
 * Official LOCK picks stay queued until the lead window opens, then become due immediately.
 */
export function queuePostAt(
  tier: PickTier | string,
  startAt: string,
  leadMinutes: number,
  now: Date = new Date(),
): string {
  if (tier === "soft_floor") return now.toISOString();
  return postAtFor(startAt, Math.max(MIN_OFFICIAL_LEAD_MINUTES, leadMinutes));
}
