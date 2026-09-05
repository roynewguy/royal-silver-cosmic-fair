import { isOfficialDay } from "../sports/day.ts";
import { ROTATE_SKIP_REASON } from "../sports/rank.ts";
import type { GameCard, PickRow } from "../sports/types.ts";

export type TicketLabel =
  | "candidate"
  | "provisional"
  | "verifying"
  | "official"
  | "win"
  | "loss"
  | "push"
  | "void"
  | "pass"
  | "rotated"
  | "manual";

export function ticketLabel(pick: PickRow): TicketLabel {
  if (pick.result === "WIN") return "win";
  if (pick.result === "LOSS") return "loss";
  if (pick.result === "PUSH") return "push";
  if (pick.result === "VOID") return "void";
  if (pick.status === "posting") return "verifying";
  if (pick.status === "posted") {
    if (pick.pickSource === "manual_live") return "manual";
    if (pick.pickSource === "manual" || !pick.officialKey) return "manual";
    return "official";
  }
  if (pick.status === "queued") return pick.officialKey ? "provisional" : "manual";
  if (pick.status === "skipped") {
    if (pick.skipReason?.includes("Rotated") || pick.skipReason === ROTATE_SKIP_REASON) return "rotated";
    return "pass";
  }
  return "pass";
}

export function ticketCopy(label: TicketLabel): string {
  switch (label) {
    case "candidate":
      return "CANDIDATE";
    case "provisional":
      return "PROVISIONAL";
    case "verifying":
      return "VERIFYING DK";
    case "official":
      return "OFFICIAL";
    case "win":
      return "WIN";
    case "loss":
      return "LOSS";
    case "push":
      return "PUSH";
    case "void":
      return "VOID";
    case "rotated":
      return "ROTATED";
    case "manual":
      return "MANUAL";
    default:
      return "PASS";
  }
}

export function isLockedTicket(pick: PickRow): boolean {
  return pick.status === "posting" || pick.status === "posted" || pick.status === "graded";
}

export function todayOfficialCard(picks: PickRow[], now = new Date()): PickRow[] {
  return picks
    .filter((p) => p.officialKey && isOfficialDay(p.startAt, now) && p.status !== "skipped")
    .sort((a, b) => {
      const order = (s: string) => (s === "posted" || s === "graded" || s === "posting" ? 0 : 1);
      return order(a.status) - order(b.status) || +new Date(a.startAt) - +new Date(b.startAt);
    });
}

export function slateGameLabel(game: GameCard, picks: PickRow[]): TicketLabel {
  const pick = picks.find((p) => p.gameId === game.id && p.status !== "skipped");
  if (pick) return ticketLabel(pick);
  if (game.status !== "scheduled") return "pass";
  if (game.rank && game.rank.edgePct > 0) return "candidate";
  return "pass";
}
