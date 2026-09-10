import { createFileRoute } from "@tanstack/react-router";
import { HealthBoard } from "@/components/desk/health-board";

export const Route = createFileRoute("/desk/health")({
  component: HealthBoard,
});
