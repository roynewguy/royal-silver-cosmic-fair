import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { accuracy, backtestSides, brier, calibrationBuckets, logLoss, type SideEval } from "./evaluate.ts";
import { FEATURE_NAMES, featureVector } from "./features.ts";
import { applyStandard, clampProb, fitLogReg, predictLogReg, standardize } from "./logreg.ts";
import { assertChronological, chronologicalSplit } from "./splits.ts";
import type { ResearchSport } from "./sports.ts";
import type { LogRegArtifact, TrainingRow } from "./types.ts";
import type { DatasetFile } from "./dataset.ts";

function toEval(rows: TrainingRow[], p: number[]): SideEval[] {
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

function predictAll(rows: TrainingRow[], means: number[], stds: number[], weights: number[]): number[] {
  return rows.map((row) => clampProb(predictLogReg(applyStandard(featureVector(row), means, stds), weights)));
}

function summarize(name: string, rows: TrainingRow[], probs: number[]) {
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

export async function trainSport(spec: ResearchSport, opts: { datasetFile: string; artifactDir: string }): Promise<LogRegArtifact> {
  const data = JSON.parse(await readFile(opts.datasetFile, "utf8")) as DatasetFile;
  const split = chronologicalSplit(data.rows, { trainTo: spec.trainTo, validTo: spec.validTo });
  assertChronological(split);
  if (split.train.length < 40) throw new Error(`Not enough ${spec.id} train rows (${split.train.length}).`);
  const { z, means, stds } = standardize(split.train.map(featureVector));
  const weights = fitLogReg(z, split.train.map((r) => (r.homeWin ? 1 : 0)));
  const day = new Date().toISOString().slice(0, 10);
  const modelVersion = `${spec.shadowPrefix}-logreg-${day}`;
  const artifact: LogRegArtifact = {
    modelVersion,
    sport: spec.id.toUpperCase(),
    target: "home_win",
    trainedAt: new Date().toISOString(),
    trainFrom: split.train[0]?.startAt ?? "",
    trainTo: split.train.at(-1)?.startAt ?? spec.trainTo,
    validFrom: split.valid[0]?.startAt ?? "",
    validTo: split.valid.at(-1)?.startAt ?? spec.validTo,
    testFrom: split.test[0]?.startAt ?? "",
    testTo: split.test.at(-1)?.startAt ?? "",
    featureNames: [...FEATURE_NAMES],
    means,
    stds,
    weights,
    metrics: {
      train: summarize("train", split.train, predictAll(split.train, means, stds, weights)),
      valid: summarize("valid", split.valid, predictAll(split.valid, means, stds, weights)),
      test: summarize("test", split.test, predictAll(split.test, means, stds, weights)),
    },
    notes: [
      `Production remains ${spec.production}. This artifact is shadow/research only.`,
      "Do not promote automatically.",
      ...data.notes,
    ],
  };
  await mkdir(opts.artifactDir, { recursive: true });
  const dir = join(opts.artifactDir, spec.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${modelVersion}.json`), JSON.stringify(artifact, null, 2));
  await writeFile(join(dir, "latest.json"), JSON.stringify(artifact, null, 2));
  if (spec.id === "mlb") await writeFile(join(opts.artifactDir, "latest.json"), JSON.stringify(artifact, null, 2));
  return artifact;
}
