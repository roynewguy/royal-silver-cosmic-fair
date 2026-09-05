import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldStartInProcessWorker } from "./worker-policy.ts";

test("Vercel does not start a second in-process worker", () => {
  assert.equal(shouldStartInProcessWorker({ VERCEL: "1" }), false);
  assert.equal(shouldStartInProcessWorker({}), true);
});
