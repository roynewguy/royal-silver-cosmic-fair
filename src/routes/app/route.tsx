import { createFileRoute } from "@tanstack/react-router";
import { MemberShell } from "@/components/site/member-shell";

export const Route = createFileRoute("/app")({
  component: MemberShell,
});
