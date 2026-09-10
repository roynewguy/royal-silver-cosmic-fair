import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/slate")({
  beforeLoad: () => {
    throw redirect({ to: "/desk/slate" });
  },
});
