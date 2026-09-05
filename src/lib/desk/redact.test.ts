import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPostEvent, gradeDisposition } from "./posting.ts";
import { isPublicPickStatus, redactDesk } from "./redact.ts";
import type { DeskState, PickRow } from "@/lib/sports/types";

test("queued never grades; posted can grade", () => {
  assert.equal(gradeDisposition("queued", true, "scheduled"), "skip-unposted");
  assert.equal(gradeDisposition("posting", true, "in_progress"), "skip-unposted");
  assert.equal(gradeDisposition("posted", true, "final"), "grade");
  assert.equal(gradeDisposition("queued", false, "scheduled"), "wait");
});

test("posting claim is exclusive", () => {
  assert.equal(applyPostEvent("queued", "claim"), "posting");
  assert.equal(applyPostEvent("posting", "claim"), null);
  assert.equal(applyPostEvent("posted", "claim"), null);
  assert.equal(applyPostEvent("posting", "success"), "posted");
  assert.equal(applyPostEvent("posting", "fail"), "queued");
  assert.equal(applyPostEvent("queued", "fail"), null);
  assert.equal(applyPostEvent("posting", "stale"), "skipped");
});

test("non-operators cannot see queued picks, ranks, or logs", () => {
  const pick = {
    id: 1,
    status: "queued",
    research: "secret",
    edgePct: 8,
    confidence: 70,
    modelProbability: 0.6,
    modelEdge: 8,
    freezeJson: "{}",
  } as PickRow;
  const posted = { ...pick, id: 2, status: "posted" as const };
  const state = {
    operator: false,
    games: [{ rank: { model: "v2-nfl" }, injuries: [{ player: "QB" }], notes: ["x"] }],
    picks: [pick, posted],
    log: [{ id: 1, kind: "scan", sport: "NFL", message: "secret", createdAt: "" }],
    scans: [{ skipped: true, skipReason: "Edge 9%" }],
    minEdgePct: 3,
    minConfidence: 58,
    lastDeskAt: "now",
    calibration: { buckets: [], models: [], official: 1, decided: 1, note: "secret" },
  } as unknown as DeskState;
  const publicState = redactDesk(state, false);
  assert.equal(publicState.picks.length, 1);
  assert.equal(publicState.calibration, null);
  assert.equal(publicState.picks[0]?.id, 2);
  assert.equal(publicState.picks[0]?.confidence, 70);
  assert.equal(publicState.picks[0]?.research, null);
  assert.equal(publicState.games[0]?.rank, null);
  assert.equal(publicState.log.length, 0);
  assert.equal(publicState.minEdgePct, 0);
  const op = redactDesk(state, true);
  assert.equal(op.picks.length, 2);
  assert.equal(op.operator, true);
});

test("only posted and graded are public pick statuses", () => {
  assert.equal(isPublicPickStatus("queued"), false);
  assert.equal(isPublicPickStatus("posting"), false);
  assert.equal(isPublicPickStatus("posted"), true);
  assert.equal(isPublicPickStatus("graded"), true);
});
