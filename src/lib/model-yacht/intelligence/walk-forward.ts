export type TimeRow = { startAt: string };

export type WalkSplit<T extends TimeRow> = {
  trainFrom: string;
  trainTo: string;
  validFrom: string;
  validTo: string;
  testFrom: string;
  testTo: string;
  train: T[];
  valid: T[];
  test: T[];
};

function t(iso: string): number {
  const n = Date.parse(iso);
  if (!Number.isFinite(n)) throw new Error(`bad timestamp ${iso}`);
  return n;
}

function assertChronological<T extends TimeRow>(rows: T[]): T[] {
  const ordered = [...rows].sort((a, b) => t(a.startAt) - t(b.startAt));
  for (let i = 1; i < ordered.length; i += 1) {
    if (t(ordered[i].startAt) < t(ordered[i - 1].startAt)) {
      throw new Error("leak: walk-forward rows are not chronological");
    }
  }
  return ordered;
}

export function expandingWalkForward<T extends TimeRow>(
  rows: T[],
  cuts: Array<{ trainTo: string; validTo: string }>,
): WalkSplit<T>[] {
  const ordered = assertChronological(rows);
  return cuts.map((cut) => {
    const trainEnd = t(cut.trainTo);
    const validEnd = t(cut.validTo);
    if (validEnd <= trainEnd) throw new Error("validTo must be after trainTo");
    const train = ordered.filter((r) => t(r.startAt) <= trainEnd);
    const valid = ordered.filter((r) => t(r.startAt) > trainEnd && t(r.startAt) <= validEnd);
    const test = ordered.filter((r) => t(r.startAt) > validEnd);
    if (train.length && valid.length && t(valid[0].startAt) <= t(train.at(-1)!.startAt)) {
      throw new Error("leak: valid overlaps train");
    }
    if (valid.length && test.length && t(test[0].startAt) <= t(valid.at(-1)!.startAt)) {
      throw new Error("leak: test overlaps valid");
    }
    return {
      trainFrom: train[0]?.startAt ?? cut.trainTo,
      trainTo: cut.trainTo,
      validFrom: valid[0]?.startAt ?? cut.trainTo,
      validTo: cut.validTo,
      testFrom: test[0]?.startAt ?? cut.validTo,
      testTo: test.at(-1)?.startAt ?? cut.validTo,
      train,
      valid,
      test,
    };
  });
}

/** Explicitly forbidden. Random splits leak future games into train. */
export function randomTrainTestSplit(): never {
  throw new Error("random train/test split across time is forbidden");
}
