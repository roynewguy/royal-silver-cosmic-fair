import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import { cronAuthorized } from "./cron-auth";

export { cronAuthorized };

const COOKIE = "boatboyz_op";
const LOCAL_ONLY_PIN = "boatboyz";

function hashPin(pin: string): string {
  return createHash("sha256").update(`boatboyz:${pin.trim()}`).digest("hex");
}

function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

async function configuredPinHash(): Promise<string | null> {
  const env = process.env.BOATBOYZ_PIN?.trim();
  if (env) return hashPin(env);
  const sql = await getSql();
  const rows = await sql<{ operator_pin_hash: string | null }>`
    select operator_pin_hash from desk_meta where id = 1
  `;
  if (rows[0]?.operator_pin_hash) return rows[0].operator_pin_hash;
  // Local / Grok preview only. Never write this into the database, never use it on Vercel.
  if (!onVercel()) return hashPin(LOCAL_ONLY_PIN);
  return null;
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
  return { ok: false, error: "Operator PIN required." };
}

export async function loginWithPin(pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const expectedHex = await configuredPinHash();
  if (!expectedHex) {
    return { ok: false, error: "BOATBOYZ_PIN is not set. Add it in hosting secrets." };
  }
  const expected = Buffer.from(expectedHex, "hex");
  const got = Buffer.from(hashPin(pin), "hex");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { ok: false, error: "Wrong PIN." };
  }
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
  if (next.trim().length < 4) return { ok: false, error: "PIN must be at least 4 characters." };
  const sql = await getSql();
  await sql`update desk_meta set operator_pin_hash = ${hashPin(next)}, updated_at = now() where id = 1`;
  return { ok: true };
}
