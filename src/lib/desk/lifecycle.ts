import type { GameStatus, PickStatus } from "@/lib/sports/types";

/** Legacy soft/DESK queue rows must expire — research-only, never Discord. */
export const SOFT_FLOOR_EXPIRED_REASON =
  "PASS_SOFT_FLOOR_EXPIRED: soft/DESK research-only; never Discord";

export const DISCORD_AUTH_SKIP_REASON =
  "PASS_DISCORD_AUTH: webhook 401/403 — fix credentials; not retried";

export function parseQueuedContextJson(
  raw: string | null | undefined,
): { softFloor?: boolean; pickTier?: string } | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { softFloor?: boolean; pickTier?: string };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** True when context marks a soft_floor / DESK queue ticket. */
export function isSoftFloorQueuedContext(raw: string | null | undefined): boolean {
  const ctx = parseQueuedContextJson(raw);
  if (!ctx) return false;
  return ctx.softFloor === true || ctx.pickTier === "soft_floor";
}

/**
 * Pre-post gate: started / postponed / cancelled / uncertain / already-consumed
 * tickets must never attempt Discord.
 */
export function postAttemptBlockReason(input: {
  status: PickStatus | string;
  gameStatus: GameStatus | string;
  gameStarted?: boolean;
  freezeJson?: string | null;
}): string | null {
  const { status, gameStatus } = input;
  if (status === "delivery_unknown") {
    return "DELIVERY_UNKNOWN: never blind-repost; inspect frozen ticket first";
  }
  if (status === "posted" || status === "graded" || status === "posting") {
    return "PASS_ALREADY_POSTED: posting token already consumed";
  }
  if (status === "skipped") return "PASS_ALREADY_POSTED: ticket already skipped";
  if (input.freezeJson) return "PASS_ALREADY_POSTED: freeze already present";
  if (gameStatus === "postponed") return "PASS_POSTPONED";
  if (gameStatus === "cancelled") return "PASS_CANCELLED";
  if (
    gameStatus === "in_progress" ||
    gameStatus === "final" ||
    gameStatus === "suspended" ||
    input.gameStarted === true
  ) {
    return "PASS_GAME_STARTED";
  }
  if (gameStatus !== "scheduled" && status === "queued") {
    return "PASS_GAME_STARTED";
  }
  return null;
}

export function isDiscordAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

export function classifyDiscordHttp(status: number): {
  uncertain: boolean;
  authFailure: boolean;
} {
  return {
    uncertain: status >= 500,
    authFailure: isDiscordAuthFailure(status),
  };
}

/** Stale posting recovery: known Discord id → posted; else delivery_unknown (never requeue). */
export function stalePostingRecoveryStatus(input: {
  status: string;
  discordMessageId?: string | null;
}): "posted" | "delivery_unknown" | null {
  if (input.status !== "posting") return null;
  return input.discordMessageId ? "posted" : "delivery_unknown";
}

/** Official WIN/LOSS/PUSH/VOID recaps. POSTPONED never becomes a customer result post. */
export function shouldQueueOfficialResultPost(input: {
  ledger?: string | null;
  result: string | null;
  gameStatus: string;
}): boolean {
  if (input.gameStatus === "postponed") return false;
  if (input.ledger === "paper") return false;
  return input.result === "WIN" || input.result === "LOSS" || input.result === "PUSH" || input.result === "VOID";
}
