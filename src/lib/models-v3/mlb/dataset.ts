import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildMlbRows } from "./features.ts";
import { ingestMlbRange } from "./ingest.ts";
import type { MlbRow } from "../types.ts";

export type DatasetFile = {
  createdAt: string;
  source: "espn-site-scoreboard + espn-core-odds";
  from: string;
  to: string;
  games: number;
  rows: MlbRow[];
  dropped: number;
  notes: string[];
};

export async function buildMlbDataset(opts: {
  from: string;
  to: string;
  cacheDir: string;
  outFile: string;
}): Promise<DatasetFile> {
  const ingest = await ingestMlbRange({ from: opts.from, to: opts.to, cacheDir: opts.cacheDir });
  const { rows, dropped } = buildMlbRows(ingest.games, ingest.odds, ingest.starters);
  const payload: DatasetFile = {
    createdAt: new Date().toISOString(),
    source: "espn-site-scoreboard + espn-core-odds",
    from: opts.from,
    to: opts.to,
    games: ingest.games.length,
    rows,
    dropped,
    notes: [
      "Team form is rebuilt from prior finals only (no ESPN record field).",
      "Historical moneylines are ESPN BET open/close, not verified DraftKings.",
      "Starter ERA is ESPN probable-pitcher season ERA on that scoreboard dump.",
      "Rows need 10 prior games per team. Ties and non-finals are dropped.",
    ],
  };
  await mkdir(dirname(opts.outFile), { recursive: true });
  await writeFile(opts.outFile, JSON.stringify(payload));
  return payload;
}
