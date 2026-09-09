import { chronologicalSplit, assertChronological } from "./splits.ts";
import type { MlbRow, Split } from "./types.ts";

export type WalkFold = {
  trainFrom: string;
  trainTo: string;
  validFrom: string;
  validTo: string;
  testFrom: string;
  testTo: string;
  split: Record<Split, MlbRow[]>;
};

/** Expanding-window walk-forward. Never trains on future games. */
export function walkForwardFolds(
  rows: MlbRow[],
  cuts: Array<{ trainTo: string; validTo: string }>,
): WalkFold[] {
  const ordered = [...rows].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const folds: WalkFold[] = [];
  for (const cut of cuts) {
    const split = chronologicalSplit(ordered, cut);
    assertChronological(split);
    folds.push({
      trainFrom: split.train[0]?.startAt ?? cut.trainTo,
      trainTo: cut.trainTo,
      validFrom: split.valid[0]?.startAt ?? cut.trainTo,
      validTo: cut.validTo,
      testFrom: split.test[0]?.startAt ?? cut.validTo,
      testTo: split.test.at(-1)?.startAt ?? cut.validTo,
      split,
    });
  }
  return folds;
}
