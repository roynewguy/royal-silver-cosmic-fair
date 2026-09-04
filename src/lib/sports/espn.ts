import { LEAGUES, type LeagueConfig } from "./leagues.ts";
import { parseAmerican, parseLine } from "./odds.ts";
import { parseInjuryStatus } from "./models/injury.ts";
import type { GameCard, GameStatus, Injury, OddsSnapshot, Starter, TeamInfo } from "./types.ts";

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
  injuries?: {
    athlete?: { displayName?: string };
    status?: string;
    details?: { type?: string; position?: { abbreviation?: string } };
  }[];
  probables?: {
    displayName?: string;
    athlete?: { displayName?: string };
    statistics?: { name?: string; abbreviation?: string; displayValue?: string; value?: number }[];
  }[];
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
    weather?: { displayValue?: string; temperature?: number; conditionId?: string; gust?: number; windSpeed?: number };
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

function splitOf(comp: EspnCompetitor | undefined, type: string): string | null {
  return comp?.records?.find((r) => r.type === type)?.summary ?? null;
}

function starterFrom(comp: EspnCompetitor | undefined): Starter | null {
  const p = comp?.probables?.[0];
  if (!p) return null;
  const stats = p.statistics ?? [];
  const num = (names: string[]) => {
    const hit = stats.find((s) => names.includes((s.name ?? s.abbreviation ?? "").toLowerCase()));
    if (!hit) return null;
    const n = typeof hit.value === "number" ? hit.value : Number(hit.displayValue);
    return Number.isFinite(n) ? n : null;
  };
  return {
    name: p.displayName ?? p.athlete?.displayName ?? "TBD",
    era: num(["era", "earned run average"]),
    whip: num(["whip"]),
    savePct: num(["savepercentage", "sv%", "svpct", "save pct"]),
    position: null,
  };
}

function teamFrom(comp: EspnCompetitor | undefined): TeamInfo {
  const scoreRaw = comp?.score;
  const score = scoreRaw == null || scoreRaw === "" ? null : Number(scoreRaw);
  const record =
    splitOf(comp, "total") ??
    comp?.records?.[0]?.summary ??
    null;
  if (comp?.athlete) {
    return {
      name: comp.athlete.displayName ?? "TBD",
      abbr: (comp.athlete.shortName ?? comp.athlete.displayName ?? "TBD").slice(0, 12),
      logo: comp.athlete.flag?.href ?? null,
      score: Number.isFinite(score) ? score : null,
      record,
      homeSplit: null,
      roadSplit: null,
      starter: null,
    };
  }
  return {
    name: comp?.team?.displayName ?? "TBD",
    abbr: comp?.team?.abbreviation ?? "TBD",
    logo: comp?.team?.logo ?? null,
    score: Number.isFinite(score) ? score : null,
    record,
    homeSplit: splitOf(comp, "home"),
    roadSplit: splitOf(comp, "road") ?? splitOf(comp, "away"),
    starter: starterFrom(comp),
  };
}

function injuriesFrom(home?: EspnCompetitor, away?: EspnCompetitor): Injury[] {
  const rows: Injury[] = [];
  const pull = (c: EspnCompetitor | undefined, team: "home" | "away") => {
    for (const inj of c?.injuries ?? []) {
      const player = inj.athlete?.displayName;
      if (!player) continue;
      rows.push({
        team,
        player,
        status: parseInjuryStatus(inj.status ?? inj.details?.type),
        position: inj.details?.position?.abbreviation ?? null,
      });
    }
  };
  pull(home, "home");
  pull(away, "away");
  return rows.slice(0, 16);
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

function weatherFrom(comp: {
  weather?: { displayValue?: string; temperature?: number; conditionId?: string; gust?: number; windSpeed?: number };
}): string | null {
  const w = comp.weather;
  if (!w) return null;
  const bits = [
    w.displayValue,
    w.temperature != null ? `${w.temperature}°` : null,
    w.windSpeed != null ? `wind ${w.windSpeed}` : null,
    w.gust != null ? `gust ${w.gust}` : null,
  ].filter(Boolean);
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
        "User-Agent": "Mozilla/5.0 (compatible; BoatBoyz/2.0)",
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
  const board = await fetchInjuryBoard(league);
  return [...byId.values()].map((g) => mergeInjuryBoard(g, board));
}

export async function fetchAllSlates(): Promise<GameCard[]> {
  const settled = await Promise.allSettled(LEAGUES.map((l) => fetchLeagueSlate(l)));
  const games: GameCard[] = [];
  settled.forEach((result) => {
    if (result.status === "fulfilled") games.push(...result.value);
  });
  return games;
}

type BoardInj = { abbr: string; player: string; status: string; position: string | null };

const injuryCache = new Map<string, { at: number; rows: BoardInj[] }>();

async function fetchInjuryBoard(league: LeagueConfig): Promise<BoardInj[]> {
  const hit = injuryCache.get(league.id);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.rows;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.espnSport}/${league.espnLeague}/injuries`;
  try {
    const payload = (await fetchJson(url)) as {
      items?: {
        id?: string;
        injuries?: {
          status?: string;
          athlete?: { displayName?: string; position?: { abbreviation?: string } };
          details?: { type?: string };
        }[];
      }[];
      teams?: {
        team?: { abbreviation?: string };
        injuries?: {
          status?: string;
          athlete?: { displayName?: string; position?: { abbreviation?: string } };
        }[];
      }[];
    };
    const rows: BoardInj[] = [];
    for (const team of payload.teams ?? []) {
      const abbr = team.team?.abbreviation;
      if (!abbr) continue;
      for (const inj of team.injuries ?? []) {
        if (!inj.athlete?.displayName) continue;
        rows.push({
          abbr,
          player: inj.athlete.displayName,
          status: inj.status ?? "",
          position: inj.athlete.position?.abbreviation ?? null,
        });
      }
    }
    injuryCache.set(league.id, { at: Date.now(), rows });
    return rows;
  } catch {
    injuryCache.set(league.id, { at: Date.now(), rows: [] });
    return [];
  }
}

function mergeInjuryBoard(game: GameCard, board: BoardInj[]): GameCard {
  if (!board.length) return game;
  const extra: Injury[] = [];
  for (const row of board) {
    const team =
      row.abbr === game.home.abbr ? "home" : row.abbr === game.away.abbr ? "away" : null;
    if (!team) continue;
    extra.push({
      team,
      player: row.player,
      status: parseInjuryStatus(row.status),
      position: row.position,
    });
  }
  if (!extra.length) return game;
  const seen = new Set(game.injuries.map((i) => `${i.team}:${i.player}`));
  const merged = [...game.injuries];
  for (const inj of extra) {
    const key = `${inj.team}:${inj.player}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(inj);
  }
  return { ...game, injuries: merged.slice(0, 20) };
}

export function inWindow(game: GameCard, days: number, now = Date.now()): boolean {
  const t = new Date(game.startAt).getTime();
  if (Number.isNaN(t)) return false;
  const horizon = now + days * 86_400_000;
  const floor = now - 8 * 3_600_000;
  return t <= horizon && (t >= floor || game.status !== "scheduled");
}
