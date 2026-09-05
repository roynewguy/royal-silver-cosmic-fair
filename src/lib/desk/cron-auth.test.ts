import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeCron, cronAuthorized, githubOidcClaimsOk } from "./cron-auth.ts";

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

test("authorizeCron accepts CRON_SECRET without hitting OIDC", async () => {
  process.env.CRON_SECRET = "super-secret-token";
  assert.equal(await authorizeCron(req({ authorization: "Bearer super-secret-token" })), true);
  assert.equal(await authorizeCron(req({ authorization: "Bearer nope" })), false);
});

test("GitHub OIDC claims must be this repo, this workflow, main", () => {
  const now = Date.parse("2026-09-05T14:00:00.000Z");
  const good = {
    iss: "https://token.actions.githubusercontent.com",
    aud: "boatboyz-tick",
    repository: "roynewguy/royal-silver-cosmic-fair",
    ref: "refs/heads/main",
    job_workflow_ref: "roynewguy/royal-silver-cosmic-fair/.github/workflows/boatboyz-tick.yml@refs/heads/main",
    exp: now / 1000 + 60,
  };
  assert.equal(githubOidcClaimsOk(good, now), true);
  assert.equal(githubOidcClaimsOk({ ...good, repository: "evil/fork" }, now), false);
  assert.equal(githubOidcClaimsOk({ ...good, ref: "refs/heads/feat" }, now), false);
  assert.equal(githubOidcClaimsOk({ ...good, aud: "https://github.com/roynewguy/royal-silver-cosmic-fair" }, now), false);
  assert.equal(
    githubOidcClaimsOk(
      { ...good, job_workflow_ref: "roynewguy/royal-silver-cosmic-fair/.github/workflows/ci.yml@refs/heads/main" },
      now,
    ),
    false,
  );
  assert.equal(githubOidcClaimsOk({ ...good, exp: now / 1000 - 1 }, now), false);
});
