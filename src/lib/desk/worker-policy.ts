/** In-process 10-minute loop is preview-only. Vercel uses GitHub Actions → /api/cron/tick. */
export function shouldStartInProcessWorker(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.VERCEL?.trim();
}
