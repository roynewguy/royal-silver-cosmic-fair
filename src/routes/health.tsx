import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";
import { HealthBoard } from "@/components/desk/health-board";

export const Route = createFileRoute("/health")({ component: HealthPage });

function HealthPage() {
  return (
    <DeskShell>
      <HealthBoard />
    </DeskShell>
  );
}
