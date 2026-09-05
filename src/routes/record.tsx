import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";
import { RecordBoard } from "@/components/desk/record-board";

export const Route = createFileRoute("/record")({ component: RecordPage });

function RecordPage() {
  return (
    <DeskShell>
      <RecordBoard />
    </DeskShell>
  );
}
