import { isDraftKingsLine } from "./odds-api.ts";
import { parseAmerican, parseLine, priceFor, lineFor, selectionLabel } from "./odds.ts";
import { defaultPlayReason } from "./why.ts";
import type { GameCard, GameStatus, Market, Side } from "./types.ts";

export type PickSource = "auto" | "manual" | "manual_live";
export type LineSource = "draftkings" | "odds-api" | "espn" | "manual-entry";

export const NEEDS_MANUAL_GRADE = "NEEDS_MANUAL_GRADE";

export function pickSourceForStatus(status: GameStatus): Exclude<PickSource, "auto"> {
  return status === "in_progress" || status === "delayed" ? "manual_live" : "manual";
}

export function isManualSource(source: string | null | undefined): boolean {
  return source === "manual" || source === "manual_live";
}

export function countsTowardAutoRecord(input: { pickSource?: string | null; officialKey?: string | null }): boolean {
  if (isManualSource(input.pickSource)) return false;
  return Boolean(input.officialKey);
}

export function countsTowardAutoCap(input: { pickSource?: string | null; officialKey?: string | null; status?: string }): boolean {
  if (!countsTowardAutoRecord(input)) return false;
  return input.status === "queued" || input.status === "posting" || input.status === "posted" || input.status === "graded";
}

export function liveStateLabel(game: Pick<GameCard, "status" | "shortDetail" | "period" | "clock" | "sport">): string | null {
  if (game.status === "scheduled") return null;
  if (game.status === "final") return "Final";
  if (game.shortDetail?.trim()) return game.shortDetail.trim();
  if (game.status === "in_progress") {
    const clock = game.clock?.trim();
    const period = game.period;
    if (period && clock) return `${periodLabel(game.sport, period)} · ${clock}`;
    if (clock) return `LIVE · ${clock}`;
    return "LIVE";
  }
  return game.status.replaceAll("_", " ");
}

function periodLabel(sport: string, period: number): string {
  const s = sport.toUpperCase();
  if (s === "MLB") return period <= 9 ? `${period}` : `${period}`;
  if (s === "NHL") return `${period}`;
  if (s === "NFL" || s === "NCAAF") return `Q${period}`;
  return `${period}Q`;
}

export function lineSourceOf(game: GameCard, overridden: boolean): LineSource {
  if (overridden) return "manual-entry";
  if (isDraftKingsLine(game.odds)) return "draftkings";
  if (game.odds.source === "odds-api") return "odds-api";
  if (game.odds.source === "espn") return "espn";
  return "manual-entry";
}

export function lineSourceLabel(source: LineSource): string {
  if (source === "draftkings") return "DraftKings";
  if (source === "odds-api") return "Odds API";
  if (source === "espn") return "ESPN";
  return "Manual Entry";
}

export function clampManualUnits(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(10, Math.max(0.25, Math.round(n * 4) / 4));
}

export function canAutoGradeManual(input: { market: Market; side: Side; lockedLine: number | null; lockedOdds: number }): boolean {
  if (!Number.isFinite(input.lockedOdds) || input.lockedOdds === 0) return false;
  if (input.market === "moneyline") return input.side === "home" || input.side === "away";
  if (input.market === "total") return (input.side === "over" || input.side === "under") && input.lockedLine != null;
  if (input.market === "spread") return (input.side === "home" || input.side === "away") && input.lockedLine != null;
  return false;
}

export function resolveManualTicket(input: {
  game: GameCard;
  market: Market;
  side: Side;
  selection?: string;
  line?: string | number | null;
  odds?: string | number | null;
  units?: string | number | null;
  note?: string | null;
}): {
  selection: string;
  line: number | null;
  odds: number;
  units: number;
  lineSource: LineSource;
  needsManualGrade: boolean;
  pickSource: Exclude<PickSource, "auto">;
  reason: string;
  postedScore: string;
  postedState: string | null;
} {
  const feedPrice = priceFor(input.game.odds, input.market, input.side);
  const feedLine = lineFor(input.game.odds, input.market, input.side);
  const customOdds = parseAmerican(input.odds);
  const customLine = parseLine(input.line);
  const overridden = customOdds != null || customLine != null || Boolean(input.selection?.trim());
  const odds = customOdds ?? feedPrice ?? -110;
  const line = customLine ?? feedLine;
  const selection =
    input.selection?.trim() ||
    selectionLabel({
      market: input.market,
      side: input.side,
      homeAbbr: input.game.home.abbr,
      awayAbbr: input.game.away.abbr,
      line,
      price: odds,
    });
  const needsManualGrade = !canAutoGradeManual({ market: input.market, side: input.side, lockedLine: line, lockedOdds: odds });
  const away = `${input.game.away.abbr} ${input.game.away.score ?? "—"}`;
  const home = `${input.game.home.abbr} ${input.game.home.score ?? "—"}`;
  return {
    selection,
    line,
    odds,
    units: clampManualUnits(input.units),
    lineSource: lineSourceOf(input.game, overridden && (customOdds != null || customLine != null)),
    needsManualGrade,
    pickSource: pickSourceForStatus(input.game.status),
    reason: defaultPlayReason(input.game, input.side, input.note),
    postedScore: `${away} · ${home}`,
    postedState: liveStateLabel(input.game),
  };
}
