import { createFileRoute } from "@tanstack/react-router";

async function handleTick(request: Request): Promise<Response> {
  const { cronAuthorized, tickDesk } = await import("@/lib/desk/api");
  const { dbSource } = await import("@/lib/db");
  const { isFreeBetaMode } = await import("@/lib/sports/free-beta");
  if (!cronAuthorized(request)) {
    return Response.json({ ok: false, contacted: false, error: "Unauthorized" }, { status: 401 });
  }
  const tick = await tickDesk("cron", true);
  return Response.json({
    ok: true,
    contacted: true,
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
