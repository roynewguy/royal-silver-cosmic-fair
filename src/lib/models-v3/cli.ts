import { mkdir } from "node:fs/promises";
import { buildDataset } from "./dataset.ts";
import { RESEARCH_BY_ID, officialResearchSports } from "./sports.ts";
import { trainSport } from "./train.ts";

const cmd = process.argv[2];
const sportArg = (process.argv[3] ?? process.env.SPORT ?? "all").toLowerCase();
const specs = sportArg === "all" ? officialResearchSports() : [RESEARCH_BY_ID[sportArg]].filter(Boolean);
if (!specs.length) {
  console.error(`Unknown sport ${sportArg}. Try: ${officialResearchSports().map((s) => s.id).join(", ")}`);
  process.exit(1);
}

await mkdir("research/data", { recursive: true });

if (cmd === "dataset") {
  for (const spec of specs) {
    const ds = await buildDataset(spec, {
      cacheDir: process.env.RESEARCH_CACHE ?? "research/cache",
      outFile: `research/data/${spec.id}-dataset.json`,
    });
    console.log(JSON.stringify({ ok: true, league: spec.id, games: ds.games, rows: ds.rows.length, dropped: ds.dropped }, null, 2));
  }
} else if (cmd === "train") {
  for (const spec of specs) {
    try {
      const art = await trainSport(spec, {
        datasetFile: `research/data/${spec.id}-dataset.json`,
        artifactDir: "src/lib/models-v3/artifacts",
      });
      const test = art.metrics.test as { n: number; brier: number; logLoss: number; accuracy: number };
      console.log(JSON.stringify({ ok: true, modelVersion: art.modelVersion, testN: test?.n, brier: test?.brier, logLoss: test?.logLoss, accuracy: test?.accuracy, production: spec.production }, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ ok: false, league: spec.id, error: err instanceof Error ? err.message : String(err) }));
    }
  }
} else {
  console.error("Usage: cli.ts dataset|train [sport|all]");
  process.exit(1);
}
