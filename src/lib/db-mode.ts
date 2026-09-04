export type DbSource = "neon" | "pglite";

export function databaseUrlFrom(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.DATABASE_URL;
  return raw && raw.trim() ? raw.trim() : undefined;
}

export function hostedRequiresNeon(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL?.trim());
}

export function resolveDbSource(env: NodeJS.ProcessEnv = process.env): DbSource {
  return databaseUrlFrom(env) ? "neon" : "pglite";
}

export function productionDatabaseError(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!hostedRequiresNeon(env)) return null;
  if (databaseUrlFrom(env)) return null;
  return "DATABASE_URL is required on Vercel. PGLite is preview-only and does not persist picks. Create a free Neon project and set DATABASE_URL to the pooled connection string.";
}
