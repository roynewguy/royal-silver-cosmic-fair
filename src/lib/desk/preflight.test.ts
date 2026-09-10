import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePreflightVerdict } from "./preflight-verdict.ts";

test("preflight is RED when official webhook is missing and GREEN when critical path is ready", () => {
  const base = [
    { name: "Database", status: "READY" as const },
    { name: "Automation", status: "READY" as const },
    { name: "ESPN", status: "READY" as const },
    { name: "Odds API", status: "READY" as const },
    { name: "Discord picks", status: "READY" as const },
    { name: "Discord results", status: "READY" as const },
    { name: "Discord alerts", status: "READY" as const },
    { name: "Webhook isolation", status: "READY" as const },
  ];
  assert.equal(evaluatePreflightVerdict({ checks: base, deliveryUnknown: 0 }).verdict, "GREEN");
  assert.equal(
    evaluatePreflightVerdict({
      checks: base.map((c) => c.name === "Discord alerts" ? { ...c, status: "BLOCKED" as const } : c),
      deliveryUnknown: 0,
    }).verdict,
    "RED",
  );
});
