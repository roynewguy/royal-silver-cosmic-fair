import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";
import { SlateBoard } from "@/components/desk/slate-board";

export const Route = createFileRoute("/slate")({ component: SlatePage });

function SlatePage() {
  return (
    <DeskShell>
      <SlateBoard />
    </DeskShell>
  );
}
