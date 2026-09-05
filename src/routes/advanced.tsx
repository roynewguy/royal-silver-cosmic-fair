import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";
import { AdvancedBoard } from "@/components/desk/advanced-board";

export const Route = createFileRoute("/advanced")({ component: AdvancedPage });

function AdvancedPage() {
  return (
    <DeskShell>
      <AdvancedBoard />
    </DeskShell>
  );
}
