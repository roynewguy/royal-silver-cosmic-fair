import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const GITHUB_OIDC_ISS = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUD = "boatboyz-tick";
const GITHUB_OIDC_REPO = "roynewguy/royal-silver-cosmic-fair";
const GITHUB_OIDC_WORKFLOW_PREFIX = `${GITHUB_OIDC_REPO}/.github/workflows/boatboyz-tick.yml@`;
const GITHUB_OIDC_JWKS = new URL("https://token.actions.githubusercontent.com/.well-known/jwks");

const g = globalThis as typeof globalThis & {
  __boatboyzGithubJwks?: ReturnType<typeof createRemoteJWKSet>;
};

function githubJwks() {
  g.__boatboyzGithubJwks ??= createRemoteJWKSet(GITHUB_OIDC_JWKS);
  return g.__boatboyzGithubJwks;
}

function bearerToken(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(auth);
  return m?.[1] ?? "";
}

/** Vercel sends `Authorization: Bearer ${CRON_SECRET}`. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const token = bearerToken(request);
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function githubOidcClaimsOk(payload: JWTPayload | Record<string, unknown>, now = Date.now()): boolean {
  if (payload.iss !== GITHUB_OIDC_ISS) return false;
  const aud = payload.aud;
  const audOk = aud === GITHUB_OIDC_AUD || (Array.isArray(aud) && aud.includes(GITHUB_OIDC_AUD));
  if (!audOk) return false;
  if (payload.repository !== GITHUB_OIDC_REPO) return false;
  if (payload.ref !== "refs/heads/main") return false;
  const workflow = String(payload.job_workflow_ref ?? "");
  if (!workflow.startsWith(GITHUB_OIDC_WORKFLOW_PREFIX)) return false;
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return false;
  return true;
}

async function githubOidcAuthorized(token: string): Promise<boolean> {
  if (token.split(".").length !== 3) return false;
  try {
    const { payload } = await jwtVerify(token, githubJwks(), {
      issuer: GITHUB_OIDC_ISS,
      audience: GITHUB_OIDC_AUD,
      clockTolerance: 30,
    });
    return githubOidcClaimsOk(payload);
  } catch {
    return false;
  }
}

/** CRON_SECRET (Vercel cron) or a GitHub Actions OIDC token from BoatBoyz tick on main. */
export async function authorizeCron(request: Request): Promise<boolean> {
  if (cronAuthorized(request)) return true;
  const token = bearerToken(request);
  if (!token) return false;
  return githubOidcAuthorized(token);
}
