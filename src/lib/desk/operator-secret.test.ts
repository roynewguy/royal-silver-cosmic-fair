import assert from "node:assert/strict";
import { test } from "node:test";
import {
  envSecretMatches,
  hashOperatorSecret,
  MIN_SECRET_LEN,
  secretTooShort,
  verifyOperatorSecret,
} from "./operator-secret.ts";

test("operator secret minimum is 8", () => {
  assert.equal(MIN_SECRET_LEN, 8);
  assert.equal(secretTooShort("1234567"), true);
  assert.equal(secretTooShort("12345678"), false);
});

test("scrypt round-trip verifies", () => {
  const stored = hashOperatorSecret("harbor-lock-99");
  assert.equal(verifyOperatorSecret("harbor-lock-99", stored), true);
  assert.equal(verifyOperatorSecret("wrong-secret", stored), false);
  assert.equal(verifyOperatorSecret("harbor-lock-99", "sha256$abc"), false);
});

test("env compare is length-safe", () => {
  assert.equal(envSecretMatches("abcdefghi", "abcdefghi"), true);
  assert.equal(envSecretMatches("abcdefghi", "abcdefghz"), false);
  assert.equal(envSecretMatches("short", "abcdefghi"), false);
});
