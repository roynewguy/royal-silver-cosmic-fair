import assert from "node:assert/strict";
import { test } from "node:test";
import { safeOddsError } from "./odds-error.ts";
test("odds diagnostics distinguish authentication, quota, and server failures without leaking secrets", () => {
 assert.match(safeOddsError(new Error("Odds API 401")), /authentication/);
 assert.match(safeOddsError(new Error("Odds API 429")), /quota/);
 assert.match(safeOddsError(new Error("Odds API 500")), /500/);
 assert.equal(safeOddsError(new Error("https://provider?apiKey=secret")), "Odds API connection failed or timed out. No verified odds available.");
});
