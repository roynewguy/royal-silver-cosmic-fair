import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";

export const Route = createFileRoute("/desk")({
  component: DeskShell,
});
