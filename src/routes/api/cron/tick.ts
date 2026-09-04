import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/tick")({
  server: {
    handlers: {
      GET: async () => {
        const { tickDesk } = await import("@/lib/desk/api");
        const tick = await tickDesk("cron");
        return Response.json({ ok: true, tick });
      },
      POST: async () => {
        const { tickDesk } = await import("@/lib/desk/api");
        const tick = await tickDesk("cron");
        return Response.json({ ok: true, tick });
      },
    },
  },
});
