import { createFileRoute } from "@tanstack/react-router";
import { HomeBoard } from "@/components/desk/home-board";

export const Route = createFileRoute("/desk/")({
  component: HomeBoard,
});
