import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const MIN_SECRET_LEN = 8;

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 32 } as const;

export function hashOperatorSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT.keyLen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyOperatorSecret(secret: string, stored: string): boolean {
  if (!stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  const saltHex = parts[1];
  const hashHex = parts[2];
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(secret, salt, expected.length, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

export function envSecretMatches(provided: string, envValue: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(envValue);
  if (a.length !== b.length) {
    const pad = Buffer.alloc(32);
    timingSafeEqual(pad, pad);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function secretTooShort(secret: string): boolean {
  return secret.trim().length < MIN_SECRET_LEN;
}
