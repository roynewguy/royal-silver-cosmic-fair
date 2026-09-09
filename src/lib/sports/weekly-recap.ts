import { ptDayKey } from "./day.ts";
import { formatUnits } from "../utils.ts";
import { formatClvSummaryLine, type ClvSummary } from "./closing.ts";
import type { DeskRecord } from "./types.ts";

/** Latest report due at Monday 09:00 Pacific; date arithmetic stays DST independent. */
export function weeklyPeriod(now = new Date()): { start: string; end: string; publishDate: string } {
  const day = ptDayKey(now);
  const localDate = new Date(`${day}T12:00:00Z`);
  const weekday = localDate.getUTCDay();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(now));
  const sinceMonday = (weekday + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - sinceMonday - (weekday === 1 && hour < 9 ? 7 : 0));
  const end = localDate.toISOString().slice(0,10);
  localDate.setUTCDate(localDate.getUTCDate() - 7);
  return { start: localDate.toISOString().slice(0,10), end, publishDate: end };
}

export function buildWeeklyRecap(
  period: {start:string;end:string},
  week: DeskRecord & {voids:number},
  overall: DeskRecord,
  clv?: ClvSummary | null,
): string {
  const sunday = new Date(`${period.end}T12:00:00Z`); sunday.setUTCDate(sunday.getUTCDate()-1);
  const lines = ["🌊 **BOATBOYZ • WEEKLY RECAP**", `📅 ${period.start} – ${sunday.toISOString().slice(0,10)} • Pacific Time`, "",
    `✅ **${week.wins} W**   ❌ **${week.losses} L**   ↔️ **${week.pushes} P**   🚫 **${week.voids} VOID**`,
    `💰 Net units: **${formatUnits(week.units)}**`,
    `📊 ROI: **${week.riskedUnits ? `${(week.units/week.riskedUnits*100).toFixed(1)}%` : "—"}**`,
    `⏳ Pending at publication: **${week.pending}**`];
  if (clv) {
    lines.push(formatClvSummaryLine(clv, "CLV (straights · tip closes)"));
  }
  lines.push("",
    `🏁 Overall at publication: **${overall.wins}-${overall.losses}-${overall.pushes}** • **${formatUnits(overall.units)}**`, "",
    "Games starting Monday–Sunday PT. Automated official picks only.",
    "CLV uses real DraftKings tip/start quotes on the same market/line — never invented.",
    "Unfinished games are not counted as wins or losses. Later settlements appear in #results.",
    "Every result recorded. No losses removed.");
  return lines.join("\n");
}
