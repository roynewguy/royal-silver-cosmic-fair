/**
 * Model Yacht intelligence lifecycle. Separate from V2 ModelStatus.
 * Never flip VERIFIED or PRODUCTION by hand to launch.
 * Evidence only. CEO/Royal must approve PRODUCTION. Never auto-switch.
 */

export const MODEL_LIFECYCLE = [
  "BLOCKED",
  "DATA_COLLECTION",
  "SHADOW",
  "VALIDATING",
  "CANARY_READY",
  "VERIFIED",
  "PRODUCTION",
] as const;

export type ModelLifecycle = (typeof MODEL_LIFECYCLE)[number];

export const LIFECYCLE_ORDER: Record<ModelLifecycle, number> = {
  BLOCKED: 0,
  DATA_COLLECTION: 1,
  SHADOW: 2,
  VALIDATING: 3,
  CANARY_READY: 4,
  VERIFIED: 5,
  PRODUCTION: 6,
};

export type LifecycleEvidence = {
  nForward: number;
  brier: number | null;
  championBrier: number | null;
  logLoss: number | null;
  calibrationError: number | null;
  clv: number | null;
  missingDataRate: number | null;
  operationalFailures: number;
  roi: number | null;
};

export const MIN_FORWARD_FOR_VALIDATING = 80;
export const MIN_FORWARD_FOR_VERIFIED = 300;
export const MAX_CALIBRATION_ERROR = 0.08;
export const MAX_MISSING_DATA_RATE = 0.45;

const ORDER = MODEL_LIFECYCLE;

export function isModelLifecycle(v: string): v is ModelLifecycle {
  return (ORDER as readonly string[]).includes(v);
}

export function blockedReason(reason: string): { lifecycle: "BLOCKED"; reason: string } {
  return { lifecycle: "BLOCKED", reason };
}

/** Allowed one-step forward moves. PRODUCTION is never a next-step without CEO. */
export function allowedTransitions(from: ModelLifecycle): ModelLifecycle[] {
  switch (from) {
    case "BLOCKED":
      return ["DATA_COLLECTION"];
    case "DATA_COLLECTION":
      return ["SHADOW", "BLOCKED"];
    case "SHADOW":
      return ["VALIDATING", "DATA_COLLECTION", "BLOCKED"];
    case "VALIDATING":
      return ["CANARY_READY", "SHADOW", "BLOCKED"];
    case "CANARY_READY":
      return ["VERIFIED", "VALIDATING", "BLOCKED"];
    case "VERIFIED":
      return ["CANARY_READY", "BLOCKED"];
    case "PRODUCTION":
      return ["VERIFIED", "BLOCKED"];
  }
}

export function verifyingReasons(evidence: LifecycleEvidence): string[] {
  const reasons: string[] = [];
  if (evidence.nForward < MIN_FORWARD_FOR_VERIFIED) {
    reasons.push(`Need ${MIN_FORWARD_FOR_VERIFIED}+ forward shadow predictions (${evidence.nForward}).`);
  }
  if (evidence.brier == null || evidence.championBrier == null || evidence.brier >= evidence.championBrier) {
    reasons.push("Need a better Brier score than the production champion.");
  }
  if (evidence.clv == null || evidence.clv <= 0) {
    reasons.push("Need positive forward CLV.");
  }
  if (evidence.calibrationError == null || evidence.calibrationError > MAX_CALIBRATION_ERROR) {
    reasons.push("Calibration error is too high or missing.");
  }
  if (evidence.missingDataRate != null && evidence.missingDataRate > MAX_MISSING_DATA_RATE) {
    reasons.push("Missing-data rate is too high.");
  }
  if (evidence.operationalFailures > 0) {
    reasons.push("Operational failures must be zero.");
  }
  return reasons;
}

export function canEnterVerified(evidence: LifecycleEvidence): boolean {
  return verifyingReasons(evidence).length === 0;
}

export function canEnterValidating(evidence: LifecycleEvidence): boolean {
  return evidence.nForward >= MIN_FORWARD_FOR_VALIDATING && evidence.operationalFailures === 0;
}

/**
 * Propose the next lifecycle. Never jumps to PRODUCTION.
 * ROI alone cannot verify a model.
 */
export function proposeLifecycle(input: {
  current: ModelLifecycle;
  evidence: LifecycleEvidence;
}): { next: ModelLifecycle; reasons: string[] } {
  const { current, evidence } = input;
  if (current === "BLOCKED") {
    return { next: "BLOCKED", reasons: ["Blocked models stay blocked until the sport architecture exists."] };
  }
  if (current === "DATA_COLLECTION") {
    return { next: "SHADOW", reasons: ["Data collection complete enough to emit shadow predictions."] };
  }
  if (current === "SHADOW") {
    if (canEnterValidating(evidence)) return { next: "VALIDATING", reasons: ["Forward sample large enough to validate."] };
    return { next: "SHADOW", reasons: [`Need ${MIN_FORWARD_FOR_VALIDATING}+ forward predictions before VALIDATING.`] };
  }
  if (current === "VALIDATING") {
    if (canEnterVerified(evidence)) return { next: "CANARY_READY", reasons: ["Evidence bar met. Canary still required before VERIFIED."] };
    return { next: "VALIDATING", reasons: verifyingReasons(evidence) };
  }
  if (current === "CANARY_READY") {
    if (canEnterVerified(evidence)) return { next: "VERIFIED", reasons: ["Evidence recorded. CEO may later approve a sport-specific canary."] };
    return { next: "CANARY_READY", reasons: verifyingReasons(evidence) };
  }
  if (current === "VERIFIED") {
    return { next: "VERIFIED", reasons: ["Verified from evidence. PRODUCTION requires explicit CEO approval."] };
  }
  return { next: current, reasons: ["No automatic production switch."] };
}

/** PRODUCTION is CEO-only and sport-specific. Never auto. Never bundles all sports. */
export function approveProduction(input: {
  current: ModelLifecycle;
  sport: string;
  ceoApproved: boolean;
  sportSpecific: boolean;
}): { ok: boolean; lifecycle: ModelLifecycle; note: string } {
  if (!input.ceoApproved) {
    return { ok: false, lifecycle: input.current, note: "CEO/Royal approval is required." };
  }
  if (!input.sportSpecific) {
    return { ok: false, lifecycle: input.current, note: "Promotion is sport-specific. Do not switch every sport together." };
  }
  if (input.current !== "VERIFIED") {
    return {
      ok: false,
      lifecycle: input.current,
      note: "A model becomes PRODUCTION only from VERIFIED. Never skip.",
    };
  }
  return {
    ok: true,
    lifecycle: "PRODUCTION",
    note: `${input.sport} challenger marked PRODUCTION on paper. V2 remains live until a separate operator unlock. This function does not change Discord or V2.`,
  };
}
