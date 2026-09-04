import { createFileRoute } from "@tanstack/react-router";
import { DeskHq } from "@/components/desk/hq";
import { DeskShell } from "@/components/desk/shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <DeskShell>
      <DeskHq />
    </DeskShell>
  );
}
