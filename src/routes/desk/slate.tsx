import { createFileRoute } from "@tanstack/react-router";
import { SlateBoard } from "@/components/desk/slate-board";

export const Route = createFileRoute("/desk/slate")({
  component: SlateBoard,
});
