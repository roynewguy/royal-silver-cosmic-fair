import { injuryNotes } from "./models/injury.ts";
import type { GameCard, RankPick } from "./types.ts";

export function whyBullets(game: GameCard, rank: RankPick): string[] {
  const bullets: string[] = [];
  const picked = rank.side === "away" ? game.away : rank.side === "home" ? game.home : null;
  const other = rank.side === "away" ? game.home : rank.side === "home" ? game.away : null;

  if (rank.side === "home") bullets.push(`${game.home.name} are playing at home`);
  if (rank.side === "away") bullets.push(`${game.away.name} still grade as the side despite the road spot`);

  if (picked?.starter?.name) bullets.push(`${picked.starter.name} is listed to start`);

  const oppOut = other ? injuryNotes(game, rank.side === "home" ? "away" : "home") : [];
  if (oppOut[0]) {
    const player = oppOut[0].replace(/\s+(OUT|DOUBTFUL)$/i, "");
    bullets.push(`opponent is missing ${player}`);
  }

  if (rank.side === "home" && game.home.homeSplit) {
    bullets.push(`home profile ${game.home.homeSplit} vs road ${game.away.roadSplit ?? game.away.record ?? "—"}`);
  } else if (rank.side === "away" && game.away.roadSplit) {
    bullets.push(`road profile ${game.away.roadSplit} vs home ${game.home.homeSplit ?? game.home.record ?? "—"}`);
  } else if (game.home.record && game.away.record) {
    bullets.push(`records ${game.away.record} @ ${game.home.record}`);
  }

  if (game.weather && (game.league === "nfl" || game.league === "ncaaf" || game.league === "mlb")) {
    bullets.push(`weather ${game.weather}`);
  }

  if (bullets.length < 2) {
    const first = rank.why.split(/[.;]/).map((s) => s.trim()).find((s) => s.length > 12);
    if (first) bullets.push(first);
  }

  const uniq = [...new Set(bullets.map((b) => b.replace(/\s+/g, " ").trim()))].filter(Boolean);
  return uniq.slice(0, 4);
}

export function formatWhy(game: GameCard, rank: RankPick): string {
  const lines = whyBullets(game, rank).map((b) => `* ${b}`);
  if (lines.length === 0) return rank.why;
  return `Why BoatBoyz likes it:\n${lines.join("\n")}`;
}
