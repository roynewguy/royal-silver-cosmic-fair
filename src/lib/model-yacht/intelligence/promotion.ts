import { canQueueOfficial, PRODUCTION_MODELS } from "../../models-v3/registry.ts";
import { approveProduction, canEnterVerified, verifyingReasons, type LifecycleEvidence, type ModelLifecycle } from "./lifecycle.ts";
import type { YachtSport } from "../core/versioning.ts";

export type PromotionDecision = {
  ok: boolean;
  sport: string;
  lifecycle: ModelLifecycle;
  livePosting: false;
  championRemains: string;
  note: string;
};

/**
 * Sport-specific. Never auto. Never switches Discord off V2.
 * ROI alone is not enough — probability quality + calibration + CLV first.
 */
export function requestPromotion(input: {
  sport: YachtSport;
  current: ModelLifecycle;
  evidence: LifecycleEvidence;
  ceoApproved: boolean;
}): PromotionDecision {
  const champion = PRODUCTION_MODELS[input.sport] ?? `v2-${input.sport}`;
  if (canQueueOfficial(champion) === false) {
    return {
      ok: false,
      sport: input.sport,
      lifecycle: input.current,
      livePosting: false,
      championRemains: champion,
      note: "Champion registry is misconfigured.",
    };
  }
  if (!canEnterVerified(input.evidence) && input.current !== "VERIFIED") {
    return {
      ok: false,
      sport: input.sport,
      lifecycle: input.current,
      livePosting: false,
      championRemains: champion,
      note: verifyingReasons(input.evidence).join(" "),
    };
  }
  const prod = approveProduction({
    current: input.current === "VERIFIED" ? "VERIFIED" : input.current,
    sport: input.sport,
    ceoApproved: input.ceoApproved,
    sportSpecific: true,
  });
  return {
    ok: prod.ok,
    sport: input.sport,
    lifecycle: prod.lifecycle,
    livePosting: false,
    championRemains: champion,
    note: prod.note,
  };
}

export function autoPromoteIsForbidden(): true {
  return true;
}
