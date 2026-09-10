import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/health")({
  beforeLoad: () => {
    throw redirect({ to: "/desk/health" });
  },
});
