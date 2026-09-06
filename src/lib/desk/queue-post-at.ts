import type { PickTier } from "@/lib/sports/types";

function postAtFor(startAt: string, leadMinutes: number): string {
  return new Date(new Date(startAt).getTime() - leadMinutes * 60_000).toISOString();
}

/** Soft-floor BEST AVAILABLE posts immediately; LOCK keeps postLeadMinutes. */
export function queuePostAt(
  tier: PickTier | string,
  startAt: string,
  leadMinutes: number,
  now: Date = new Date(),
): string {
  if (tier === "soft_floor") return now.toISOString();
  return postAtFor(startAt, leadMinutes);
}
