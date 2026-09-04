import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";

const COOKIE = "boatboyz_op";
const DEFAULT_DEV_PIN = "boatboyz";

function hashPin(pin: string): string {
  return createHash("sha256").update(`boatboyz:${pin.trim()}`).digest("hex");
}

async function pinHash(): Promise<string> {
  const env = process.env.BOATBOYZ_PIN?.trim();
  if (env) return hashPin(env);
  const sql = await getSql();
  const rows = await sql<{ operator_pin_hash: string | null }>`select operator_pin_hash from desk_meta where id = 1`;
  if (rows[0]?.operator_pin_hash) return rows[0].operator_pin_hash;
  const fallback = hashPin(DEFAULT_DEV_PIN);
  await sql`update desk_meta set operator_pin_hash = ${fallback} where id = 1 and operator_pin_hash is null`;
  return fallback;
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
  const expected = Buffer.from(await pinHash(), "hex");
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

export function cronAuthorized(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const hdr = request.headers.get("x-cron-secret") ?? "";
    return auth === `Bearer ${secret}` || hdr === secret;
  }
  return process.env.NODE_ENV !== "production";
}
