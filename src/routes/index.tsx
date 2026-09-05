import { createFileRoute } from "@tanstack/react-router";
import { HomeBoard } from "@/components/desk/home-board";
import { DeskShell } from "@/components/desk/shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <DeskShell>
      <HomeBoard />
    </DeskShell>
  );
}
