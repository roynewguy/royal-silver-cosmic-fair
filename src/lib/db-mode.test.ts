import assert from "node:assert/strict";
import { test } from "node:test";
import { productionDatabaseError, resolveDbSource } from "./db-mode.ts";

test("DATABASE_URL selects Neon, otherwise PGLite in preview", () => {
  assert.equal(resolveDbSource({}), "pglite");
  assert.equal(resolveDbSource({ DATABASE_URL: "  " }), "pglite");
  assert.equal(resolveDbSource({ DATABASE_URL: "postgres://n" }), "neon");
});

test("Vercel without DATABASE_URL is blocked; Vercel with URL is Neon", () => {
  assert.match(productionDatabaseError({ VERCEL: "1" }) ?? "", /DATABASE_URL/);
  assert.equal(productionDatabaseError({ VERCEL: "1", DATABASE_URL: "postgres://n" }), null);
  assert.equal(productionDatabaseError({}), null);
});
