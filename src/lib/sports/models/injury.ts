import { clamp } from "../odds.ts";
import type { GameCard, Injury, InjuryStatus } from "../types.ts";

export function parseInjuryStatus(raw: string | undefined): InjuryStatus {
  const s = (raw ?? "").toLowerCase();
  if (/(^| )out\b|injured reserve|\bir\b|sidelined|suspended/.test(s)) return "out";
  if (s.includes("doubt")) return "doubtful";
  if (s.includes("quest")) return "questionable";
  if (s.includes("prob")) return "probable";
  return "unknown";
}

function statusWeight(status: InjuryStatus): number {
  if (status === "out") return 1;
  if (status === "doubtful") return 0.55;
  if (status === "questionable") return 0.2;
  if (status === "probable") return 0.05;
  return 0;
}

function positionWeight(sport: string, position: string | null): number {
  const p = (position ?? "").toUpperCase();
  if (sport === "nfl" || sport === "ncaaf") {
    if (p === "QB") return 0.085;
    if (p === "WR" || p === "RB" || p === "TE") return 0.02;
    if (p === "LT" || p === "RT" || p === "OL" || p === "G" || p === "C") return 0.012;
    if (p === "CB" || p === "S" || p === "LB" || p === "DE" || p === "DT") return 0.01;
    return 0.008;
  }
  if (sport === "nba" || sport === "wnba" || sport === "ncaab") return 0.014;
  if (sport === "mlb") {
    if (p === "P" || p === "SP" || p === "RP") return 0.004;
    return 0.007;
  }
  if (sport === "nhl") {
    if (p === "G") return 0.05;
    if (p === "C" || p === "LW" || p === "RW") return 0.012;
    return 0.008;
  }
  return 0.01;
}

/** Positive favors the home team. */
export function injuryDelta(game: GameCard, sport: string): number {
  let d = 0;
  for (const inj of game.injuries ?? []) {
    const w = statusWeight(inj.status) * positionWeight(sport, inj.position);
    d += inj.team === "away" ? w : -w;
  }
  return clamp(d, -0.09, 0.09);
}

export function injuryNotes(game: GameCard, team: "home" | "away"): string[] {
  return (game.injuries ?? [])
    .filter((i) => i.team === team && (i.status === "out" || i.status === "doubtful"))
    .slice(0, 3)
    .map((i) => `${i.player} ${i.status.toUpperCase()}`);
}
