import assert from "node:assert/strict";
import { test } from "node:test";
import { cronAuthorized } from "./cron-auth.ts";

function req(headers: Record<string, string>) {
  return new Request("https://example.com/api/cron/tick", { headers });
}

test("rejects when CRON_SECRET is missing", () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(cronAuthorized(req({ authorization: "Bearer x" })), false);
  if (prev !== undefined) process.env.CRON_SECRET = prev;
});

test("rejects x-vercel-cron without bearer secret", () => {
  process.env.CRON_SECRET = "super-secret-token";
  assert.equal(cronAuthorized(req({ "x-vercel-cron": "1" })), false);
});

test("rejects NODE_ENV development bypass", () => {
  process.env.CRON_SECRET = "super-secret-token";
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  assert.equal(cronAuthorized(req({})), false);
  process.env.NODE_ENV = prev;
});

test("accepts Authorization Bearer CRON_SECRET", () => {
  process.env.CRON_SECRET = "super-secret-token";
  assert.equal(cronAuthorized(req({ authorization: "Bearer super-secret-token" })), true);
});

test("rejects wrong bearer token", () => {
  process.env.CRON_SECRET = "super-secret-token";
  assert.equal(cronAuthorized(req({ authorization: "Bearer nope" })), false);
});
