/** Missing configuration is deliberately OFF. This gate never disables grading. */
export function livePostingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOATBOYZ_LIVE_POSTING?.trim().toLowerCase() === "true";
}

export function isFreshTimestamp(at: string | null | undefined, maxAgeMs: number, now = Date.now()): boolean {
  const time = at ? Date.parse(at) : NaN;
  return Number.isFinite(time) && time <= now && now - time <= maxAgeMs;
}
