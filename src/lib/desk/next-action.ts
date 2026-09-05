import { relativeTo } from "../utils.ts";
import type { AutomationStatus } from "./health.ts";
import { ticketLabel, todayOfficialCard } from "./card-view.ts";
import type { PickRow } from "../sports/types.ts";

export function nextActionLine(input: {
  automation: AutomationStatus;
  nextScanAt: string | null;
  target: number;
  picks: PickRow[];
  now?: Date;
}): string {
  if (input.automation === "unarmed") {
    return "GitHub tick has not contacted BoatBoyz recently.";
  }
  if (input.automation === "offline") {
    return "Automation is offline. Last GitHub tick is stale.";
  }
  const now = input.now ?? new Date();
  const card = todayOfficialCard(input.picks, now);
  const verifying = card.find((p) => ticketLabel(p) === "verifying");
  if (verifying) return `Verifying ${verifying.selection}`;
  const due = card
    .filter((p) => p.status === "queued")
    .sort((a, b) => +new Date(a.postAt) - +new Date(b.postAt))[0];
  if (due && new Date(due.postAt).getTime() - now.getTime() < 45 * 60_000) {
    return `Waiting for DraftKings verification window · ${due.selection}`;
  }
  const locked = card.filter((p) => p.status === "posting" || p.status === "posted" || p.status === "graded").length;
  if (locked >= input.target) return "Daily target reached";
  if (card.length === 0) return "PASS — no remaining games qualify";
  if (input.nextScanAt) return `Scanning again ${relativeTo(input.nextScanAt, now.getTime())}`;
  return "Scanning the slate on the next tick";
}
