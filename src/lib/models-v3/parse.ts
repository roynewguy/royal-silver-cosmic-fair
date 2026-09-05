import { parseAmerican } from "../sports/odds.ts";
import type { HistoricalGame, HistoricalOdds, StarterFeat } from "./types.ts";

type Comp = {
  id?: string;
  date?: string;
  venue?: { fullName?: string };
  status?: { type?: { name?: string; state?: string; completed?: boolean } };
  competitors?: Array<{
    homeAway?: string;
    winner?: boolean;
    score?: string | number;
    team?: { displayName?: string; abbreviation?: string };
    athlete?: { displayName?: string; shortName?: string };
    probables?: Array<{
      athlete?: { displayName?: string };
      statistics?: Array<{ abbreviation?: string; displayValue?: string; name?: string }>;
    }>;
  }>;
};

export function mapStatus(raw?: string, state?: string, completed?: boolean): string {
  if (completed || state === "post") return "final";
  const s = `${raw ?? ""} ${state ?? ""}`.toLowerCase();
  if (s.includes("postpone")) return "postponed";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("final")) return "final";
  if (s.includes("in_progress") || state === "in") return "in_progress";
  return "scheduled";
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function seasonOf(iso: string): number {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  return d.getUTCMonth() < 2 ? y - 1 : y;
}

function sideName(c?: Comp["competitors"] extends (infer T)[] | undefined ? T : never): { name: string; abbr: string } | null {
  if (!c) return null;
  const abbr = c.team?.abbreviation ?? c.athlete?.shortName ?? c.athlete?.displayName;
  const name = c.team?.displayName ?? c.athlete?.displayName ?? abbr;
  if (!abbr || !name) return null;
  return { name, abbr };
}

export function parseStarter(comp?: Comp["competitors"] extends (infer T)[] | undefined ? T : never): StarterFeat {
  const p = comp?.probables?.[0];
  const era = p?.statistics?.find((s) => s.abbreviation === "ERA" || s.name === "ERA")?.displayValue;
  const w = p?.statistics?.find((s) => s.abbreviation === "W" || s.name === "wins")?.displayValue;
  const l = p?.statistics?.find((s) => s.abbreviation === "L" || s.name === "losses")?.displayValue;
  return {
    name: p?.athlete?.displayName ?? null,
    era: era != null ? num(era) : null,
    wins: w != null ? num(w) : null,
    losses: l != null ? num(l) : null,
  };
}

export function parseScoreboardEvent(
  event: { id?: string; date?: string; competitions?: Comp[] },
  league: { id: string; sport: string },
): Array<{ game: HistoricalGame; starters: { home: StarterFeat; away: StarterFeat } }> {
  const out: Array<{ game: HistoricalGame; starters: { home: StarterFeat; away: StarterFeat } }> = [];
  for (const c of event.competitions ?? []) {
    const homeC = c.competitors?.find((x) => x.homeAway === "home") ?? c.competitors?.[1];
    const awayC = c.competitors?.find((x) => x.homeAway === "away") ?? c.competitors?.[0];
    const home = sideName(homeC);
    const away = sideName(awayC);
    if (!home || !away) continue;
    const espnId = String(c.id ?? event.id ?? "");
    const startAt = c.date ?? event.date ?? "";
    if (!espnId || !startAt) continue;
    const status = mapStatus(c.status?.type?.name, c.status?.type?.state, c.status?.type?.completed);
    const homeScoreRaw = num(homeC?.score);
    const awayScoreRaw = num(awayC?.score);
    let homeScore = homeScoreRaw;
    let awayScore = awayScoreRaw;
    if (homeScore == null && awayScore == null && (homeC?.winner === true || awayC?.winner === true) && !(homeC?.winner && awayC?.winner)) {
      homeScore = homeC?.winner ? 1 : 0;
      awayScore = awayC?.winner ? 1 : 0;
    }
    out.push({
      game: {
        gameId: `${league.id}:espn:${espnId}`,
        espnId,
        sport: league.sport,
        league: league.id,
        season: seasonOf(startAt),
        startAt,
        homeTeam: home.name,
        awayTeam: away.name,
        homeAbbr: home.abbr,
        awayAbbr: away.abbr,
        homeScore,
        awayScore,
        status,
        venue: c.venue?.fullName ?? null,
        homeWin: status === "final" && homeScore != null && awayScore != null ? homeScore > awayScore : null,
      },
      starters: { home: parseStarter(homeC), away: parseStarter(awayC) },
    });
  }
  return out;
}

function americanFrom(node: unknown): number | null {
  if (node == null) return null;
  if (typeof node === "number") return Number.isFinite(node) && node !== 0 ? Math.round(node) : null;
  if (typeof node === "object") {
    const o = node as { american?: string; alternateDisplayValue?: string };
    return parseAmerican(o.american ?? o.alternateDisplayValue);
  }
  return parseAmerican(node);
}

export function parseCoreOdds(gameId: string, payload: {
  items?: Array<{
    provider?: { id?: string; name?: string };
    homeTeamOdds?: { moneyLine?: unknown; open?: { moneyLine?: unknown }; close?: { moneyLine?: unknown } };
    awayTeamOdds?: { moneyLine?: unknown; open?: { moneyLine?: unknown }; close?: { moneyLine?: unknown } };
  }>;
}): HistoricalOdds | null {
  const items = payload.items ?? [];
  const pref =
    items.find((i) => /draft\s*kings/i.test(i.provider?.name ?? "")) ??
    items.find((i) => i.provider?.id === "58") ??
    items.find((i) => /espn bet/i.test(i.provider?.name ?? "") && !/live/i.test(i.provider?.name ?? "")) ??
    items[0];
  if (!pref) return null;
  const h = pref.homeTeamOdds;
  const a = pref.awayTeamOdds;
  return {
    gameId,
    sportsbook: pref.provider?.name ?? "ESPN BET",
    market: "moneyline",
    homeOpen: americanFrom(h?.open?.moneyLine) ?? americanFrom(h?.moneyLine),
    awayOpen: americanFrom(a?.open?.moneyLine) ?? americanFrom(a?.moneyLine),
    homeClose: americanFrom(h?.close?.moneyLine) ?? americanFrom(h?.moneyLine),
    awayClose: americanFrom(a?.close?.moneyLine) ?? americanFrom(a?.moneyLine),
  };
}

export function ymdList(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    out.push(`${y}${m}${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
