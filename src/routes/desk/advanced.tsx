import { createFileRoute } from "@tanstack/react-router";
import { AdvancedBoard } from "@/components/desk/advanced-board";

export const Route = createFileRoute("/desk/advanced")({
  component: AdvancedBoard,
});
