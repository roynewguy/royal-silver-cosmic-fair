import { LEAGUES, type LeagueConfig } from "./leagues";
import { parseAmerican, parseLine } from "./odds";
import type { GameCard, GameStatus, OddsSnapshot, TeamInfo } from "./types";

type EspnCompetitor = {
  homeAway?: string;
  score?: string | number;
  records?: { type?: string; summary?: string }[];
  team?: {
    displayName?: string;
    abbreviation?: string;
    logo?: string;
  };
  athlete?: {
    displayName?: string;
    shortName?: string;
    flag?: { href?: string };
  };
};

type EspnOdds = {
  provider?: { name?: string; displayName?: string };
  details?: string;
  overUnder?: number;
  spread?: number;
  moneyline?: {
    home?: { close?: { odds?: string }; open?: { odds?: string } };
    away?: { close?: { odds?: string }; open?: { odds?: string } };
  };
  pointSpread?: {
    home?: { close?: { line?: string; odds?: string }; open?: { line?: string } };
    away?: { close?: { line?: string; odds?: string } };
  };
  total?: {
    over?: { close?: { line?: string; odds?: string }; open?: { line?: string } };
    under?: { close?: { line?: string; odds?: string } };
  };
};

type EspnEvent = {
  id?: string;
  date?: string;
  headlines?: { description?: string }[];
  competitions?: {
    id?: string;
    date?: string;
    venue?: { fullName?: string };
    status?: { type?: { name?: string; state?: string; completed?: boolean } };
    competitors?: EspnCompetitor[];
    odds?: EspnOdds[];
    notes?: { headline?: string; text?: string }[];
    weather?: { displayValue?: string; temperature?: number; conditionId?: string };
  }[];
  status?: { type?: { name?: string; state?: string; completed?: boolean } };
};

function nyDateKey(offsetDays: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const now = new Date();
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  return fmt.format(shifted).replaceAll("-", "");
}

function mapStatus(raw?: string, state?: string, completed?: boolean): GameStatus {
  if (completed || state === "post") return "final";
  const s = `${raw ?? ""} ${state ?? ""}`.toLowerCase();
  if (s.includes("postpone")) return "postponed";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("suspend")) return "suspended";
  if (s.includes("delay")) return "delayed";
  if (s.includes("final") || s.includes("complete") || s.includes("status_final")) return "final";
  if (s.includes("in_progress") || s.includes("in-progress") || state === "in") return "in_progress";
  return "scheduled";
}

function pickEspnOdds(list?: EspnOdds[]): EspnOdds | undefined {
  if (!list?.length) return undefined;
  const named = (o: EspnOdds) => o.provider?.displayName ?? o.provider?.name ?? "";
  return (
    list.find((o) => /draft\s*kings/i.test(named(o))) ??
    list.find((o) => named(o).trim().length > 0) ??
    list[0]
  );
}

function parseOdds(raw: EspnOdds | undefined): OddsSnapshot {
  const empty: OddsSnapshot = {
    book: "—",
    details: null,
    homeMl: null,
    awayMl: null,
    homeSpread: null,
    awaySpread: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null,
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: null,
    source: "unknown",
    capturedAt: null,
  };
  if (!raw) return empty;
  const homeSpread =
    parseLine(raw.pointSpread?.home?.close?.line) ??
    (typeof raw.spread === "number" ? raw.spread : null);
  const awaySpread =
    parseLine(raw.pointSpread?.away?.close?.line) ??
    (homeSpread != null ? -homeSpread : null);
  const book = raw.provider?.displayName ?? raw.provider?.name ?? "ESPN";
  return {
    book,
    details: raw.details ?? null,
    homeMl: parseAmerican(raw.moneyline?.home?.close?.odds),
    awayMl: parseAmerican(raw.moneyline?.away?.close?.odds),
    homeSpread,
    awaySpread,
    homeSpreadOdds: parseAmerican(raw.pointSpread?.home?.close?.odds),
    awaySpreadOdds: parseAmerican(raw.pointSpread?.away?.close?.odds),
    total: parseLine(raw.total?.over?.close?.line) ?? parseLine(raw.overUnder),
    overOdds: parseAmerican(raw.total?.over?.close?.odds),
    underOdds: parseAmerican(raw.total?.under?.close?.odds),
    openHomeSpread: parseLine(raw.pointSpread?.home?.open?.line),
    openTotal: parseLine(raw.total?.over?.open?.line),
    openHomeMl: parseAmerican(raw.moneyline?.home?.open?.odds),
    source: "espn",
    capturedAt: new Date().toISOString(),
  };
}

function teamFrom(comp: EspnCompetitor | undefined): TeamInfo {
  const scoreRaw = comp?.score;
  const score =
    scoreRaw == null || scoreRaw === "" ? null : Number(scoreRaw);
  const record =
    comp?.records?.find((r) => r.type === "total")?.summary ??
    comp?.records?.[0]?.summary ??
    null;
  if (comp?.athlete) {
    return {
      name: comp.athlete.displayName ?? "TBD",
      abbr: (comp.athlete.shortName ?? comp.athlete.displayName ?? "TBD").slice(0, 12),
      logo: comp.athlete.flag?.href ?? null,
      score: Number.isFinite(score) ? score : null,
      record,
    };
  }
  return {
    name: comp?.team?.displayName ?? "TBD",
    abbr: comp?.team?.abbreviation ?? "TBD",
    logo: comp?.team?.logo ?? null,
    score: Number.isFinite(score) ? score : null,
    record,
  };
}

function notesFrom(comp: { notes?: { headline?: string; text?: string }[]; headlines?: { description?: string; shortLinkText?: string }[] }, event: EspnEvent): string[] {
  const out: string[] = [];
  for (const n of comp.notes ?? []) {
    const t = n.headline ?? n.text;
    if (t) out.push(t);
  }
  for (const h of (event as { headlines?: { description?: string }[] }).headlines ?? []) {
    if (h.description) out.push(h.description);
  }
  return out.slice(0, 6);
}

function injuriesFrom(home?: EspnCompetitor, away?: EspnCompetitor): string[] {
  const rows: string[] = [];
  const pull = (c?: EspnCompetitor) => {
    const list = (c as { injuries?: { athlete?: { displayName?: string }; status?: string; details?: { type?: string } }[] })?.injuries ?? [];
    for (const inj of list) {
      const name = inj.athlete?.displayName;
      if (!name) continue;
      rows.push(`${name} ${inj.status ?? inj.details?.type ?? "injury"}`.trim());
    }
  };
  pull(home);
  pull(away);
  return rows.slice(0, 8);
}

function weatherFrom(comp: { weather?: { displayValue?: string; temperature?: number; conditionId?: string } }): string | null {
  const w = comp.weather;
  if (!w) return null;
  const bits = [w.displayValue, w.temperature != null ? `${w.temperature}°` : null].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

function eventToGames(event: EspnEvent, league: LeagueConfig): GameCard[] {
  const competitions = event.competitions ?? [];
  const cards: GameCard[] = [];
  for (const comp of competitions) {
    const competitors = comp.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home") ?? competitors[1];
    const away = competitors.find((c) => c.homeAway === "away") ?? competitors[0];
    if (!home && !away) continue;
    const espnId = String(comp.id ?? event.id ?? "");
    if (!espnId) continue;
    const startAt = comp.date ?? event.date;
    if (!startAt) continue;
    const status = mapStatus(
      comp.status?.type?.name ?? event.status?.type?.name,
      comp.status?.type?.state ?? event.status?.type?.state,
      comp.status?.type?.completed ?? event.status?.type?.completed,
    );
    cards.push({
      id: `${league.id}:${espnId}`,
      espnId,
      sport: league.sport,
      league: league.id,
      startAt,
      status,
      home: teamFrom(home),
      away: teamFrom(away),
      venue: comp.venue?.fullName ?? null,
      odds: parseOdds(pickEspnOdds(comp.odds)),
      rank: null,
      notes: notesFrom(comp, event),
      injuries: injuriesFrom(home, away),
      weather: weatherFrom(comp),
    });
  }
  return cards;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function urlsFor(league: LeagueConfig): string[] {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${league.espnSport}/${league.espnLeague}/scoreboard`;
  const urls = [base];
  if (league.daily) {
    for (let i = 0; i <= league.lookAheadDays; i += 1) {
      urls.push(`${base}?dates=${nyDateKey(i)}`);
    }
  }
  return urls;
}

export async function fetchLeagueSlate(league: LeagueConfig): Promise<GameCard[]> {
  const urls = urlsFor(league);
  const results = await Promise.allSettled(urls.map((u) => fetchJson(u)));
  const byId = new Map<string, GameCard>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const payload = result.value as { events?: EspnEvent[] };
    for (const event of payload.events ?? []) {
      for (const game of eventToGames(event, league)) {
        byId.set(game.id, game);
      }
    }
  }
  return [...byId.values()];
}

export async function fetchAllSlates(): Promise<GameCard[]> {
  const settled = await Promise.allSettled(LEAGUES.map((l) => fetchLeagueSlate(l)));
  const games: GameCard[] = [];
  settled.forEach((result) => {
    if (result.status === "fulfilled") games.push(...result.value);
  });
  return games;
}

export function inWindow(game: GameCard, days: number, now = Date.now()): boolean {
  const t = new Date(game.startAt).getTime();
  if (Number.isNaN(t)) return false;
  const horizon = now + days * 86_400_000;
  const floor = now - 8 * 3_600_000;
  return t <= horizon && (t >= floor || game.status !== "scheduled");
}
