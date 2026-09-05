import type { GameStatus, PickStatus } from "@/lib/sports/types";

export type PostEvent = "claim" | "success" | "fail" | "stale";

export function applyPostEvent(status: PickStatus, event: PostEvent): PickStatus | null {
  if (event === "claim") return status === "queued" ? "posting" : null;
  if (event === "success") return status === "posting" ? "posted" : null;
  if (event === "fail") return status === "posting" ? "queued" : null;
  if (event === "stale") return status === "posting" ? "delivery_unknown" : null;
  return null;
}

export function gradeDisposition(
  status: PickStatus,
  gameStarted: boolean,
  gameStatus: GameStatus,
): "skip-unposted" | "grade" | "wait" | "void" {
  if (gameStatus === "suspended" || status === "delivery_unknown" || status === "posting") return "wait";
  if (gameStatus === "postponed" || gameStatus === "cancelled") {
    return status === "posted" ? "wait" : "skip-unposted";
  }
  if (status === "queued") {
    if (gameStarted || gameStatus === "in_progress" || gameStatus === "final") return "skip-unposted";
    return "wait";
  }
  if (status === "posted") {
    if (gameStatus === "final") return "grade";
    return "wait";
  }
  return "wait";
}

export const UNPOSTED_SKIP = "Pick was not delivered before game start.";
