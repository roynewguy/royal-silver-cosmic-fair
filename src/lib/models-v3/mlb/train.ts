import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { accuracy, backtestSides, brier, calibrationBuckets, logLoss, type SideEval } from "../evaluate.ts";
import { applyStandard, clampProb, fitLogReg, predictLogReg, standardize } from "../logreg.ts";
import { assertChronological, chronologicalSplit } from "../splits.ts";
import type { LogRegArtifact, MlbRow } from "../types.ts";
import { MLB_FEATURE_NAMES, featureVector } from "./features.ts";
import type { DatasetFile } from "./dataset.ts";

function toEval(rows: MlbRow[], p: number[]): SideEval[] {
  return rows.map((row, i) => ({
    p: clampProb(p[i] ?? 0.5),
    y: row.homeWin ? 1 : 0,
    stakePrice: row.market.homeOpen ?? row.market.homeClose,
    closePrice: row.market.homeClose,
    homePrice: row.market.homeOpen ?? row.market.homeClose,
    awayPrice: row.market.awayOpen ?? row.market.awayClose,
    closeHome: row.market.homeClose,
    closeAway: row.market.awayClose,
  }));
}

function predictAll(rows: MlbRow[], means: number[], stds: number[], weights: number[]): number[] {
  return rows.map((row) => clampProb(predictLogReg(applyStandard(featureVector(row), means, stds), weights)));
}

function summarize(name: string, rows: MlbRow[], probs: number[]) {
  const ev = toEval(rows, probs);
  return {
    split: name,
    n: rows.length,
    accuracy: accuracy(ev),
    brier: brier(ev),
    logLoss: logLoss(ev),
    calibration: calibrationBuckets(ev),
    backtest: {
      edge2: backtestSides(ev, 0.02),
      edge3: backtestSides(ev, 0.03),
      edge5: backtestSides(ev, 0.05),
    },
  };
}

export async function trainMlb(opts: {
  datasetFile: string;
  artifactDir: string;
  trainTo?: string;
  validTo?: string;
}): Promise<LogRegArtifact> {
  const data = JSON.parse(await readFile(opts.datasetFile, "utf8")) as DatasetFile;
  const trainTo = opts.trainTo ?? "2025-07-31T23:59:59Z";
  const validTo = opts.validTo ?? "2025-12-31T23:59:59Z";
  const split = chronologicalSplit(data.rows, { trainTo, validTo });
  assertChronological(split);
  if (split.train.length < 50) throw new Error(`Not enough train rows (${split.train.length}). Ingest more history.`);

  const rawX = split.train.map(featureVector);
  const { z, means, stds } = standardize(rawX);
  const y = split.train.map((r) => (r.homeWin ? 1 : 0));
  const weights = fitLogReg(z, y);

  const day = new Date().toISOString().slice(0, 10);
  const modelVersion = `v3-mlb-logreg-${day}`;
  const metrics = {
    train: summarize("train", split.train, predictAll(split.train, means, stds, weights)),
    valid: summarize("valid", split.valid, predictAll(split.valid, means, stds, weights)),
    test: summarize("test", split.test, predictAll(split.test, means, stds, weights)),
  };

  const artifact: LogRegArtifact = {
    modelVersion,
    sport: "MLB",
    target: "home_win",
    trainedAt: new Date().toISOString(),
    trainFrom: split.train[0]?.startAt ?? "",
    trainTo: split.train.at(-1)?.startAt ?? trainTo,
    validFrom: split.valid[0]?.startAt ?? "",
    validTo: split.valid.at(-1)?.startAt ?? validTo,
    testFrom: split.test[0]?.startAt ?? "",
    testTo: split.test.at(-1)?.startAt ?? "",
    featureNames: [...MLB_FEATURE_NAMES],
    means,
    stds,
    weights,
    metrics,
    notes: [
      "Production remains v2-mlb. This artifact is shadow/research only.",
      "Do not promote automatically.",
      ...data.notes,
    ],
  };

  await mkdir(opts.artifactDir, { recursive: true });
  const file = join(opts.artifactDir, `${modelVersion}.json`);
  await writeFile(file, JSON.stringify(artifact, null, 2));
  await writeFile(join(opts.artifactDir, "v3-mlb-shadow.json"), JSON.stringify({ modelVersion, file: `${modelVersion}.json` }));
  await writeFile(join(opts.artifactDir, "latest.json"), JSON.stringify(artifact, null, 2));
  return artifact;
}
