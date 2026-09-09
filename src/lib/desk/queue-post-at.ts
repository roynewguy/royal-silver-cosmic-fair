import type { PickTier } from "@/lib/sports/types";

function postAtFor(startAt: string, leadMinutes: number): string {
  return new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
}

/**
 * Legacy soft_floor (research-only; expired before flush) would post immediately if present.
 * LOCK (and any non-soft): post_at = min(now, tip−lead) so early selections
 * flush tonight; once inside the lead window, behave as before.
 */
export function queuePostAt(
  tier: PickTier | string,
  startAt: string,
  leadMinutes: number,
  now: Date = new Date(),
): string {
  if (tier === "soft_floor") return now.toISOString();
  const lead = postAtFor(startAt, leadMinutes);
  return Date.parse(lead) > now.getTime() ? now.toISOString() : lead;
}
