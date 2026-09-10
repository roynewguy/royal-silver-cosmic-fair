import { createFileRoute } from "@tanstack/react-router";
import { ModelsBoard } from "@/components/desk/models-board";

export const Route = createFileRoute("/desk/models")({
  component: ModelsBoard,
});
