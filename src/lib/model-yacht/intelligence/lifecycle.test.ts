import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODEL_LIFECYCLE,
  approveProduction,
  canEnterVerified,
  proposeLifecycle,
  verifyingReasons,
  type LifecycleEvidence,
} from "./lifecycle.ts";

const weak: LifecycleEvidence = {
  nForward: 10,
  brier: 0.25,
  championBrier: 0.22,
  logLoss: 0.6,
  calibrationError: 0.12,
  clv: -0.01,
  missingDataRate: 0.5,
  operationalFailures: 0,
  roi: 0.4,
};

const strong: LifecycleEvidence = {
  nForward: 400,
  brier: 0.18,
  championBrier: 0.22,
  logLoss: 0.52,
  calibrationError: 0.03,
  clv: 0.02,
  missingDataRate: 0.1,
  operationalFailures: 0,
  roi: -0.05,
};

test("lifecycle states are the required seven", () => {
  assert.deepEqual([...MODEL_LIFECYCLE], [
    "BLOCKED",
    "DATA_COLLECTION",
    "SHADOW",
    "VALIDATING",
    "CANARY_READY",
    "VERIFIED",
    "PRODUCTION",
  ]);
});

test("ROI alone does not verify a model", () => {
  const hotRoi: LifecycleEvidence = { ...weak, nForward: 400, roi: 0.9 };
  assert.equal(canEnterVerified(hotRoi), false);
  assert.ok(verifyingReasons(hotRoi).some((r) => /Brier/i.test(r)));
});

test("proposeLifecycle never jumps to PRODUCTION", () => {
  assert.equal(proposeLifecycle({ current: "DATA_COLLECTION", evidence: strong }).next, "SHADOW");
  assert.equal(proposeLifecycle({ current: "SHADOW", evidence: strong }).next, "VALIDATING");
  assert.equal(proposeLifecycle({ current: "VALIDATING", evidence: strong }).next, "CANARY_READY");
  assert.equal(proposeLifecycle({ current: "CANARY_READY", evidence: strong }).next, "VERIFIED");
  assert.equal(proposeLifecycle({ current: "VERIFIED", evidence: strong }).next, "VERIFIED");
});

test("PRODUCTION requires CEO and VERIFIED and is sport-specific", () => {
  assert.equal(approveProduction({ current: "VERIFIED", sport: "mlb", ceoApproved: false, sportSpecific: true }).ok, false);
  assert.equal(approveProduction({ current: "SHADOW", sport: "mlb", ceoApproved: true, sportSpecific: true }).ok, false);
  assert.equal(approveProduction({ current: "VERIFIED", sport: "mlb", ceoApproved: true, sportSpecific: false }).ok, false);
  const ok = approveProduction({ current: "VERIFIED", sport: "mlb", ceoApproved: true, sportSpecific: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.lifecycle, "PRODUCTION");
  assert.match(ok.note, /does not change Discord or V2/);
});
