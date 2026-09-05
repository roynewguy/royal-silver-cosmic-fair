import { mkdir } from "node:fs/promises";
import { buildMlbDataset } from "./dataset.ts";

const from = process.env.MLB_FROM ?? "2025-03-27";
const to = process.env.MLB_TO ?? new Date().toISOString().slice(0, 10);
const cacheDir = process.env.MLB_CACHE ?? "research/cache/mlb";
const outFile = process.env.MLB_DATASET ?? "research/data/mlb-dataset.json";

await mkdir("research/data", { recursive: true });
const ds = await buildMlbDataset({ from, to, cacheDir, outFile });
console.log(
  JSON.stringify(
    {
      ok: true,
      from,
      to,
      games: ds.games,
      rows: ds.rows.length,
      dropped: ds.dropped,
      outFile,
      source: ds.source,
    },
    null,
    2,
  ),
);
