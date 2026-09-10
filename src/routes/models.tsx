import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/models")({
  beforeLoad: () => {
    throw redirect({ to: "/desk/models" });
  },
});
