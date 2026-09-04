import { createHash, randomBytes } from "node:crypto";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import { cronAuthorized } from "./cron-auth";
import {
  envSecretMatches,
  hashOperatorSecret,
  secretTooShort,
  verifyOperatorSecret,
} from "./operator-secret";

export { cronAuthorized };

const COOKIE = "boatboyz_op";
const IP_FAILS = 5;
const WINDOW_MINUTES = 15;

export function pinFromEnv(): boolean {
  return Boolean(process.env.BOATBOYZ_PIN?.trim());
}

function clientIp(): string {
  try {
    const req = getRequest();
    const xf = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return xf || req?.headers.get("x-real-ip")?.trim() || "local";
  } catch {
    return "local";
  }
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function recordAttempt(ip: string, ok: boolean): Promise<void> {
  const sql = await getSql();
  const hash = ipHash(ip);
  await sql`insert into operator_attempts (ip_hash, ok) values (${hash}, ${ok})`;
  await sql`delete from operator_attempts where attempted_at < now() - interval '2 days'`;
}

async function unlockBlocked(ip: string): Promise<string | null> {
  const sql = await getSql();
  const hash = ipHash(ip);
  const fails = await sql<{ n: unknown }>`
    select count(*) as n from operator_attempts
    where ip_hash = ${hash} and ok = false
      and attempted_at > now() - (${WINDOW_MINUTES} * interval '1 minute')
  `;
  if (Number(fails[0]?.n ?? 0) >= IP_FAILS) {
    return "Too many attempts from this network. Wait 15 minutes.";
  }
  return null;
}

async function verifyConfigured(pin: string): Promise<boolean | "missing"> {
  const env = process.env.BOATBOYZ_PIN?.trim();
  if (env) return envSecretMatches(pin, env);
  const sql = await getSql();
  const rows = await sql<{ operator_pin_hash: string | null }>`
    select operator_pin_hash from desk_meta where id = 1
  `;
  const stored = rows[0]?.operator_pin_hash;
  if (!stored) return "missing";
  return verifyOperatorSecret(pin, stored);
}

export async function isOperator(): Promise<boolean> {
  const token = getCookie(COOKIE);
  if (!token) return false;
  const sql = await getSql();
  const rows = await sql<{ token: string }>`
    select token from desk_sessions where token = ${token} and expires_at > now() limit 1
  `;
  return rows.length > 0;
}

export async function requireOperator(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isOperator()) return { ok: true };
  return { ok: false, error: "Operator unlock required." };
}

export async function loginWithPin(pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = clientIp();
  const blocked = await unlockBlocked(ip);
  if (blocked) return { ok: false, error: blocked };

  if (secretTooShort(pin)) {
    await recordAttempt(ip, false);
    return { ok: false, error: "Operator secret must be at least 8 characters." };
  }

  const result = await verifyConfigured(pin);
  if (result === "missing") {
    await recordAttempt(ip, false);
    return { ok: false, error: "BOATBOYZ_PIN is not set. Add it in hosting secrets." };
  }
  if (!result) {
    await recordAttempt(ip, false);
    return { ok: false, error: "Unlock failed." };
  }

  await recordAttempt(ip, true);
  const token = randomBytes(24).toString("hex");
  const sql = await getSql();
  await sql`insert into desk_sessions (token, expires_at) values (${token}, now() + interval '14 days')`;
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}

export async function logoutOperator(): Promise<void> {
  const token = getCookie(COOKIE);
  if (token) {
    const sql = await getSql();
    await sql`delete from desk_sessions where token = ${token}`;
  }
  deleteCookie(COOKIE);
}

export async function changePin(next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (pinFromEnv()) {
    return { ok: false, error: "BOATBOYZ_PIN is set in hosting secrets. Change it there." };
  }
  if (secretTooShort(next)) return { ok: false, error: "Operator secret must be at least 8 characters." };
  const sql = await getSql();
  await sql`update desk_meta set operator_pin_hash = ${hashOperatorSecret(next.trim())}, updated_at = now() where id = 1`;
  return { ok: true };
}
