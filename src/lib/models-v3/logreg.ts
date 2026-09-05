function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function standardize(matrix: number[][]): { z: number[][]; means: number[]; stds: number[] } {
  const n = matrix.length;
  const d = matrix[0]?.length ?? 0;
  const means = Array(d).fill(0);
  const stds = Array(d).fill(1);
  if (!n || !d) return { z: matrix, means, stds };
  for (const row of matrix) {
    for (let j = 1; j < d; j += 1) means[j] += row[j];
  }
  for (let j = 1; j < d; j += 1) means[j] /= n;
  for (const row of matrix) {
    for (let j = 1; j < d; j += 1) stds[j] += (row[j] - means[j]) ** 2;
  }
  for (let j = 1; j < d; j += 1) {
    stds[j] = Math.sqrt(stds[j] / n) || 1;
  }
  const z = matrix.map((row) => row.map((v, j) => (j === 0 ? v : (v - means[j]) / stds[j])));
  return { z, means, stds };
}

export function applyStandard(row: number[], means: number[], stds: number[]): number[] {
  return row.map((v, j) => (j === 0 ? v : (v - (means[j] ?? 0)) / (stds[j] || 1)));
}

export function fitLogReg(
  x: number[][],
  y: number[],
  opts: { steps?: number; lr?: number; l2?: number } = {},
): number[] {
  const steps = opts.steps ?? 2500;
  const lr = opts.lr ?? 0.15;
  const l2 = opts.l2 ?? 0.01;
  const n = x.length;
  const d = x[0]?.length ?? 0;
  const w = Array(d).fill(0);
  if (!n || !d) return w;
  for (let s = 0; s < steps; s += 1) {
    const grad = Array(d).fill(0);
    for (let i = 0; i < n; i += 1) {
      let z = 0;
      for (let j = 0; j < d; j += 1) z += w[j] * x[i][j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j += 1) grad[j] += err * x[i][j];
    }
    for (let j = 0; j < d; j += 1) {
      grad[j] = grad[j] / n + l2 * w[j];
      w[j] -= lr * grad[j];
    }
  }
  return w;
}

export function predictLogReg(row: number[], weights: number[]): number {
  let z = 0;
  for (let j = 0; j < weights.length; j += 1) z += weights[j] * (row[j] ?? 0);
  return sigmoid(z);
}

export function clampProb(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.min(0.999, Math.max(0.001, p));
}
