import { applyStandard, clampProb, standardize } from "../../../models-v3/logreg.ts";

export type GbtNode =
  | { kind: "leaf"; value: number }
  | { kind: "split"; feature: number; threshold: number; left: GbtNode; right: GbtNode };

export type GbtArtifact = {
  trees: GbtNode[];
  lr: number;
  depth: number;
  nTrees: number;
  minLeaf: number;
  means: number[];
  stds: number[];
};

export type GbtOptions = {
  nTrees?: number;
  depth?: number;
  lr?: number;
  minLeaf?: number;
};

function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

function predictTree(row: number[], node: GbtNode): number {
  if (node.kind === "leaf") return node.value;
  return row[node.feature] <= node.threshold ? predictTree(row, node.left) : predictTree(row, node.right);
}

function variance(vals: number[]): number {
  if (!vals.length) return 0;
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  return vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
}

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function bestSplit(X: number[][], y: number[], idx: number[], minLeaf: number): { feature: number; threshold: number } | null {
  const n = idx.length;
  if (n < minLeaf * 2) return null;
  const d = X[0]?.length ?? 0;
  let bestGain = 0;
  let best: { feature: number; threshold: number } | null = null;
  const parent = variance(idx.map((i) => y[i]));
  if (parent <= 1e-12) return null;
  for (let f = 1; f < d; f += 1) {
    const vals = [...new Set(idx.map((i) => X[i][f]))].sort((a, b) => a - b);
    for (let k = 0; k < vals.length - 1; k += 1) {
      const threshold = (vals[k] + vals[k + 1]) / 2;
      const left: number[] = [];
      const right: number[] = [];
      for (const i of idx) {
        if (X[i][f] <= threshold) left.push(y[i]);
        else right.push(y[i]);
      }
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const gain = parent - (left.length / n) * variance(left) - (right.length / n) * variance(right);
      if (gain > bestGain) {
        bestGain = gain;
        best = { feature: f, threshold };
      }
    }
  }
  return bestGain > 1e-8 ? best : null;
}

function fitTree(X: number[][], y: number[], idx: number[], depth: number, minLeaf: number): GbtNode {
  const ys = idx.map((i) => y[i]);
  if (depth <= 0 || idx.length < minLeaf * 2) return { kind: "leaf", value: mean(ys) };
  const split = bestSplit(X, y, idx, minLeaf);
  if (!split) return { kind: "leaf", value: mean(ys) };
  const leftIdx = idx.filter((i) => X[i][split.feature] <= split.threshold);
  const rightIdx = idx.filter((i) => X[i][split.feature] > split.threshold);
  if (!leftIdx.length || !rightIdx.length) return { kind: "leaf", value: mean(ys) };
  return {
    kind: "split",
    feature: split.feature,
    threshold: split.threshold,
    left: fitTree(X, y, leftIdx, depth - 1, minLeaf),
    right: fitTree(X, y, rightIdx, depth - 1, minLeaf),
  };
}

export function fitGbt(x: number[][], y: number[], opts: GbtOptions = {}): GbtArtifact {
  const nTrees = opts.nTrees ?? 24;
  const depth = opts.depth ?? 2;
  const lr = opts.lr ?? 0.12;
  const minLeaf = opts.minLeaf ?? 8;
  const { z, means, stds } = standardize(x);
  const n = z.length;
  const F = Array(n).fill(0);
  const trees: GbtNode[] = [];
  if (!n) return { trees, lr, depth, nTrees, minLeaf, means, stds };
  for (let t = 0; t < nTrees; t += 1) {
    const residual = F.map((f, i) => y[i] - sigmoid(f));
    const tree = fitTree(z, residual, z.map((_, i) => i), depth, minLeaf);
    trees.push(tree);
    for (let i = 0; i < n; i += 1) F[i] += lr * predictTree(z[i], tree);
  }
  return { trees, lr, depth, nTrees, minLeaf, means, stds };
}

export function predictGbt(row: number[], art: GbtArtifact): number {
  const z = applyStandard(row, art.means, art.stds);
  let f = 0;
  for (const tree of art.trees) f += art.lr * predictTree(z, tree);
  return clampProb(sigmoid(f));
}
