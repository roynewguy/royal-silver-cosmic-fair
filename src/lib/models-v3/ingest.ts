import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseCoreOdds, parseScoreboardEvent, ymdList } from "./parse.ts";
import { researchLeague, type ResearchSport } from "./sports.ts";
import type { HistoricalGame, HistoricalOdds, StarterFeat } from "./types.ts";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { "user-agent": "BoatBoyzResearch/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function cached(file: string, loader: () => Promise<unknown>): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    const data = await loader();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data));
    return data;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export type IngestResult = {
  games: HistoricalGame[];
  odds: HistoricalOdds[];
  starters: Record<string, { home: StarterFeat; away: StarterFeat }>;
  days: number;
  oddsFetched: number;
};

export async function ingestRange(spec: ResearchSport, opts: { cacheDir: string; fetchOdds?: boolean; from?: string; to?: string }): Promise<IngestResult> {
  const league = researchLeague(spec.id);
  if (!league) throw new Error(`Unknown league ${spec.id}`);
  const from = opts.from ?? spec.from;
  const to = opts.to ?? spec.to;
  const days = ymdList(from, to);
  const games: HistoricalGame[] = [];
  const starters: Record<string, { home: StarterFeat; away: StarterFeat }> = {};
  const seen = new Set<string>();
  const board = (ymd: string) => {
    const u = new URL(`https://site.api.espn.com/apis/site/v2/sports/${league.espnSport}/${league.espnLeague}/scoreboard`);
    u.searchParams.set("dates", ymd);
    u.searchParams.set("limit", "300");
    if (spec.groups) u.searchParams.set("groups", spec.groups);
    return u.toString();
  };
  const oddsUrl = (id: string) =>
    `https://sports.core.api.espn.com/v2/sports/${league.espnSport}/leagues/${league.espnLeague}/events/${id}/competitions/${id}/odds`;

  await pool(days, 6, async (ymd) => {
    const file = join(opts.cacheDir, spec.id, "scoreboard", `${ymd}.json`);
    try {
      const raw = (await cached(file, () => fetchJson(board(ymd)))) as { events?: unknown[] };
      for (const ev of raw.events ?? []) {
        for (const parsed of parseScoreboardEvent(ev as never, { id: league.id, sport: league.sport })) {
          if (seen.has(parsed.game.gameId)) continue;
          seen.add(parsed.game.gameId);
          games.push(parsed.game);
          starters[parsed.game.gameId] = parsed.starters;
        }
      }
    } catch {
      /* skip empty days */
    }
  });

  const odds: HistoricalOdds[] = [];
  let oddsFetched = 0;
  if (opts.fetchOdds !== false) {
    const finals = games.filter((g) => g.status === "final");
    await pool(finals, 8, async (g) => {
      const file = join(opts.cacheDir, spec.id, "odds", `${g.espnId}.json`);
      try {
        const raw = await cached(file, async () => {
          oddsFetched += 1;
          return fetchJson(oddsUrl(g.espnId));
        });
        const row = parseCoreOdds(g.gameId, raw as never);
        if (row && (row.homeClose != null || row.homeOpen != null)) odds.push(row);
      } catch {
        /* missing odds */
      }
    });
  }
  games.sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  return { games, odds, starters, days: days.length, oddsFetched };
}
