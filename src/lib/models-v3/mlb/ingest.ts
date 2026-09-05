import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseCoreOdds, parseScoreboardEvent, ymdList } from "./parse.ts";
import type { HistoricalGame, HistoricalOdds, StarterFeat } from "../types.ts";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=";
const CORE_ODDS = (id: string) =>
  `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${id}/competitions/${id}/odds`;

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

export async function ingestMlbRange(opts: {
  from: string;
  to: string;
  cacheDir: string;
  fetchOdds?: boolean;
}): Promise<IngestResult> {
  const days = ymdList(opts.from, opts.to);
  const games: HistoricalGame[] = [];
  const starters: Record<string, { home: StarterFeat; away: StarterFeat }> = {};
  const seen = new Set<string>();

  await pool(days, 6, async (ymd) => {
    const file = join(opts.cacheDir, "scoreboard", `${ymd}.json`);
    try {
      const raw = (await cached(file, () => fetchJson(SCOREBOARD + ymd))) as { events?: unknown[] };
      for (const ev of raw.events ?? []) {
        const parsed = parseScoreboardEvent(ev as never);
        if (!parsed || seen.has(parsed.game.gameId)) continue;
        seen.add(parsed.game.gameId);
        games.push(parsed.game);
        starters[parsed.game.gameId] = parsed.starters;
      }
    } catch {
      /* skip empty/bad days */
    }
  });

  const odds: HistoricalOdds[] = [];
  let oddsFetched = 0;
  if (opts.fetchOdds !== false) {
    const finals = games.filter((g) => g.status === "final");
    await pool(finals, 8, async (g) => {
      const file = join(opts.cacheDir, "odds", `${g.espnId}.json`);
      try {
        const raw = await cached(file, async () => {
          oddsFetched += 1;
          return fetchJson(CORE_ODDS(g.espnId));
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
