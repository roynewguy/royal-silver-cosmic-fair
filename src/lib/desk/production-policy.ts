/** Missing configuration is deliberately OFF. This gate never disables grading. */

export function isShadowSoak(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SHADOW_SOAK?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/**
 * Official customer Discord posting.
 * SHADOW_SOAK wins over LIVE — soak never posts official picks/free/no-play.
 * Cannot be enabled from the operator UI.
 */
export function livePostingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isShadowSoak(env)) return false;
  return env.BOATBOYZ_LIVE_POSTING?.trim().toLowerCase() === "true";
}

export function isFreshTimestamp(at: string | null | undefined, maxAgeMs: number, now = Date.now()): boolean {
  const time = at ? Date.parse(at) : NaN;
  return Number.isFinite(time) && time <= now && now - time <= maxAgeMs;
}
