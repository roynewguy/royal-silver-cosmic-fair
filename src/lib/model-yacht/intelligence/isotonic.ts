import { clampProb } from "../../models-v3/logreg.ts";

export type IsotonicStep = { x: number; y: number };
export type IsotonicModel = { steps: IsotonicStep[] };

/**
 * Pool Adjacent Violators. Fit only on validation / OOF pairs.
 * Never on the final test set.
 */
export function isotonicFit(pairs: Array<{ p: number; y: number }>): IsotonicModel {
  const ordered = [...pairs]
    .map((r) => ({ x: clampProb(r.p), y: r.y, w: 1 }))
    .sort((a, b) => a.x - b.x);
  if (!ordered.length) return { steps: [] };
  type Block = { x: number; y: number; w: number };
  const blocks: Block[] = ordered.map((r) => ({ x: r.x, y: r.y, w: r.w }));
  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].y <= blocks[i + 1].y + 1e-12) {
      i += 1;
      continue;
    }
    const a = blocks[i];
    const b = blocks[i + 1];
    const w = a.w + b.w;
    const merged: Block = {
      x: (a.x * a.w + b.x * b.w) / w,
      y: (a.y * a.w + b.y * b.w) / w,
      w,
    };
    blocks.splice(i, 2, merged);
    i = Math.max(0, i - 1);
  }
  return { steps: blocks.map((b) => ({ x: b.x, y: Math.min(1, Math.max(0, b.y)) })) };
}

export function isotonicApply(p: number, model: IsotonicModel): number {
  if (!model.steps.length) return clampProb(p);
  const x = clampProb(p);
  if (x <= model.steps[0].x) return model.steps[0].y;
  const last = model.steps.at(-1)!;
  if (x >= last.x) return last.y;
  for (let i = 0; i < model.steps.length - 1; i += 1) {
    const a = model.steps[i];
    const b = model.steps[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return clampProb(a.y + t * (b.y - a.y));
    }
  }
  return clampProb(p);
}
