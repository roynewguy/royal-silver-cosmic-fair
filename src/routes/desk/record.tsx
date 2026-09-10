import { createFileRoute } from "@tanstack/react-router";
import { RecordBoard } from "@/components/desk/record-board";

export const Route = createFileRoute("/desk/record")({
  component: RecordBoard,
});
