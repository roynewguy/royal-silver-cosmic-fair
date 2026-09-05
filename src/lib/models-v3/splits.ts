import type { MlbRow, Split } from "./types.ts";

/** Chronological split. Never shuffle. */
export function chronologicalSplit(
  rows: MlbRow[],
  cuts: { trainTo: string; validTo: string },
): Record<Split, MlbRow[]> {
  const trainEnd = new Date(cuts.trainTo).getTime();
  const validEnd = new Date(cuts.validTo).getTime();
  const train: MlbRow[] = [];
  const valid: MlbRow[] = [];
  const test: MlbRow[] = [];
  const ordered = [...rows].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  for (const row of ordered) {
    const t = new Date(row.startAt).getTime();
    if (t <= trainEnd) train.push(row);
    else if (t <= validEnd) valid.push(row);
    else test.push(row);
  }
  return { train, valid, test };
}

export function assertChronological(split: Record<Split, MlbRow[]>): void {
  const lastTrain = split.train.at(-1)?.startAt;
  const firstValid = split.valid[0]?.startAt;
  const lastValid = split.valid.at(-1)?.startAt;
  const firstTest = split.test[0]?.startAt;
  if (lastTrain && firstValid && +new Date(firstValid) <= +new Date(lastTrain)) {
    throw new Error("valid overlaps train");
  }
  if (lastValid && firstTest && +new Date(firstTest) <= +new Date(lastValid)) {
    throw new Error("test overlaps valid");
  }
}
