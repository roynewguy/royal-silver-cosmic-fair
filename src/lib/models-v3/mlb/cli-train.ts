import { trainMlb } from "./train.ts";

const datasetFile = process.env.MLB_DATASET ?? "research/data/mlb-dataset.json";
const artifactDir = process.env.MLB_ARTIFACTS ?? "src/lib/models-v3/artifacts";
const artifact = await trainMlb({ datasetFile, artifactDir });
const test = artifact.metrics.test as { n: number; brier: number; logLoss: number; accuracy: number; backtest: { edge3: { n: number; roi: number | null } } };
console.log(
  JSON.stringify(
    {
      ok: true,
      modelVersion: artifact.modelVersion,
      train: `${artifact.trainFrom} → ${artifact.trainTo}`,
      valid: `${artifact.validFrom} → ${artifact.validTo}`,
      test: `${artifact.testFrom} → ${artifact.testTo}`,
      testN: test?.n,
      brier: test?.brier,
      logLoss: test?.logLoss,
      accuracy: test?.accuracy,
      backtestEdge3: test?.backtest?.edge3,
      production: "v2-mlb (unchanged)",
    },
    null,
    2,
  ),
);
