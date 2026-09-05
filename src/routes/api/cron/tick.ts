import { createFileRoute } from "@tanstack/react-router";

async function handleTick(request: Request): Promise<Response> {
  const { cronAuthorized } = await import("@/lib/desk/cron-auth");
  const { runTick } = await import("@/lib/desk/cycle");
  const { dbSource } = await import("@/lib/db");
  const { isFreeBetaMode } = await import("@/lib/sports/free-beta");
  if (!cronAuthorized(request)) {
    return Response.json({ ok: false, contacted: false, error: "Unauthorized" }, { status: 401 });
  }
  const tick = await runTick("cron");
  return Response.json({
    ok: true,
    contacted: !tick.skipped,
    endpoint: "/api/cron/tick",
    at: new Date().toISOString(),
    db: dbSource,
    freeBeta: isFreeBetaMode(),
    tick,
  });
}

export const Route = createFileRoute("/api/cron/tick")({
  server: {
    handlers: {
      GET: async ({ request }) => handleTick(request),
      POST: async ({ request }) => handleTick(request),
    },
  },
});
