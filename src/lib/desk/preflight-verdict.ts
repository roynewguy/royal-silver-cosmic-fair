export type PreflightStatus = "READY" | "BLOCKED" | "UNVERIFIED";
export type PreflightCheck = { name: string; status: PreflightStatus; detail: string; critical?: boolean };

const CRITICAL_NAMES = new Set([
  "Database",
  "Automation",
  "ESPN",
  "Odds API",
  "Discord picks",
  "Discord results",
  "Discord alerts",
  "Webhook isolation",
]);

/**
 * GREEN only when critical Discord + data path is proven.
 * Live posting OFF is not RED — CEO owns that switch.
 */
export function evaluatePreflightVerdict(input: {
  checks: { name: string; status: PreflightStatus }[];
  deliveryUnknown: number;
}): { verdict: "GREEN" | "RED"; reason: string } {
  if (input.deliveryUnknown > 0) {
    return {
      verdict: "RED",
      reason: `delivery_unknown=${input.deliveryUnknown}; never blind-resend`,
    };
  }
  for (const check of input.checks) {
    if (!CRITICAL_NAMES.has(check.name)) continue;
    if (check.status !== "READY") {
      return { verdict: "RED", reason: `${check.name} is ${check.status}` };
    }
  }
  const missing = [...CRITICAL_NAMES].filter((name) => !input.checks.some((c) => c.name === name));
  if (missing.length) {
    return { verdict: "RED", reason: `missing ${missing.join(", ")}` };
  }
  return {
    verdict: "GREEN",
    reason: "Critical Discord + data path ready. Live posting remains a CEO switch.",
  };
}
