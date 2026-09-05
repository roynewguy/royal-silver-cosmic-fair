import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildRows } from "./features.ts";
import { ingestRange } from "./ingest.ts";
import type { ResearchSport } from "./sports.ts";
import type { TrainingRow } from "./types.ts";

export type DatasetFile = {
  createdAt: string;
  league: string;
  source: string;
  from: string;
  to: string;
  games: number;
  rows: TrainingRow[];
  dropped: number;
  notes: string[];
};

export async function buildDataset(spec: ResearchSport, opts: { cacheDir: string; outFile: string; from?: string; to?: string }): Promise<DatasetFile> {
  const from = opts.from ?? spec.from;
  const to = opts.to ?? spec.to;
  const ingest = await ingestRange(spec, { cacheDir: opts.cacheDir, from, to });
  const { rows, dropped } = buildRows(ingest.games, ingest.odds, ingest.starters, spec.minPrior);
  const payload: DatasetFile = {
    createdAt: new Date().toISOString(),
    league: spec.id,
    source: "espn-site-scoreboard + espn-core-odds",
    from,
    to,
    games: ingest.games.length,
    rows,
    dropped,
    notes: [
      `${spec.id.toUpperCase()} form rebuilt from prior finals only.`,
      "Historical moneylines are ESPN BET open/close, not verified DraftKings.",
      `Min prior games per side: ${spec.minPrior}. Ties and non-finals dropped.`,
      "Production V2 is unchanged. This file is research-only.",
    ],
  };
  await mkdir(dirname(opts.outFile), { recursive: true });
  await writeFile(opts.outFile, JSON.stringify(payload));
  return payload;
}
