import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";
import { ModelsBoard } from "@/components/desk/models-board";

export const Route = createFileRoute("/models")({ component: ModelsPage });

function ModelsPage() {
  return (
    <DeskShell>
      <ModelsBoard />
    </DeskShell>
  );
}
