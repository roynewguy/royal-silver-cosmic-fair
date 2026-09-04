import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/tick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { cronAuthorized, tickDesk } = await import("@/lib/desk/api");
        if (!cronAuthorized(request)) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const tick = await tickDesk("cron", true);
        return Response.json({ ok: true, tick });
      },
      POST: async ({ request }) => {
        const { cronAuthorized, tickDesk } = await import("@/lib/desk/api");
        if (!cronAuthorized(request)) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const tick = await tickDesk("cron", true);
        return Response.json({ ok: true, tick });
      },
    },
  },
});
