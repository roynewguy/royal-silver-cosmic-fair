import { clampProb } from "./logreg.ts";

/** Research-only probability calibration. Never applied to live V2 posts. */
export function plattFit(
  pairs: Array<{ p: number; y: number }>,
  steps = 400,
): { a: number; b: number } {
  let a = 0;
  let b = 0;
  if (pairs.length < 80) return { a, b };
  const lr = 0.05;
  for (let s = 0; s < steps; s += 1) {
    let ga = 0;
    let gb = 0;
    for (const row of pairs) {
      const logit = Math.log(clampProb(row.p) / (1 - clampProb(row.p)));
      const z = a * logit + b;
      const pred = 1 / (1 + Math.exp(-z));
      const err = pred - row.y;
      ga += err * logit;
      gb += err;
    }
    a -= (lr * ga) / pairs.length;
    b -= (lr * gb) / pairs.length;
  }
  return { a, b };
}

export function plattApply(p: number, coef: { a: number; b: number }): number {
  const logit = Math.log(clampProb(p) / (1 - clampProb(p)));
  const z = coef.a * logit + coef.b;
  return clampProb(1 / (1 + Math.exp(-z)));
}
