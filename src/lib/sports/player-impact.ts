import { clamp } from "./odds.ts";
import type { GameCard, Injury } from "./types.ts";

/**
 * Player-importance framework for injuries / lineup shocks.
 * Missing role/value data must shrink confidence — never invent a superstar rating.
 * V2 live injuryDelta is unchanged; this is used by shadow models and quality gates.
 */
export type PlayerRole = "franchise" | "starter" | "rotation" | "bench" | "unknown";

export function roleFromSignals(input: {
  sport: string;
  position: string | null | undefined;
  starter?: boolean;
}): PlayerRole {
  const p = (input.position ?? "").toUpperCase();
  if (!p && input.starter !== true) return "unknown";
  if (input.sport === "nfl" || input.sport === "ncaaf") {
    if (p === "QB") return input.starter === false ? "rotation" : "franchise";
    if (p === "WR" || p === "RB" || p === "TE" || p === "LT" || p === "RT") {
      return input.starter ? "starter" : "rotation";
    }
  }
  if (input.sport === "nhl" && p === "G") return "franchise";
  if (input.sport === "mlb" && (p === "SP" || p === "P") && input.starter !== false) return "starter";
  if (input.sport === "nba" || input.sport === "wnba" || input.sport === "ncaab") {
    return input.starter ? "starter" : "rotation";
  }
  if (input.starter) return "starter";
  if (!p) return "unknown";
  return "rotation";
}

export function impactWeight(role: PlayerRole, statusWeight: number): number {
  const roleW =
    role === "franchise" ? 1 :
    role === "starter" ? 0.7 :
    role === "rotation" ? 0.35 :
    role === "bench" ? 0.12 :
    0.2;
  return statusWeight * roleW;
}

export function injuryStatusWeight(status: Injury["status"]): number {
  if (status === "out") return 1;
  if (status === "doubtful") return 0.55;
  if (status === "questionable") return 0.2;
  if (status === "probable") return 0.05;
  return 0;
}

/** 0–1 penalty. Unknown positions/roles reduce confidence instead of faking precision. */
export function missingPlayerValuePenalty(game: GameCard): number {
  const inj = game.injuries ?? [];
  if (!inj.length) {
    return game.injuriesFetchedAt ? 0 : 0.18;
  }
  let unknown = 0;
  for (const row of inj) {
    if (!row.position?.trim() || roleFromSignals({ sport: game.league, position: row.position }) === "unknown") {
      unknown += 1;
    }
  }
  return clamp(unknown / Math.max(inj.length, 1) * 0.22, 0, 0.22);
}

export function weightedInjuryImpact(game: GameCard): { home: number; away: number; missingValue: number } {
  let home = 0;
  let away = 0;
  for (const row of game.injuries ?? []) {
    const role = roleFromSignals({ sport: game.league, position: row.position });
    const w = impactWeight(role, injuryStatusWeight(row.status));
    if (row.team === "home") home += w;
    else away += w;
  }
  return { home, away, missingValue: missingPlayerValuePenalty(game) };
}
