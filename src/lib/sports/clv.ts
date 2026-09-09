import { impliedFromAmerican } from "./odds.ts";

/** Closing-line value in probability points. Positive = we beat the close. */
export function clvFromPrices(postedPrice: number | null | undefined, closingPrice: number | null | undefined): number | null {
  if (postedPrice == null || closingPrice == null) return null;
  if (!Number.isFinite(postedPrice) || !Number.isFinite(closingPrice) || postedPrice === 0 || closingPrice === 0) {
    return null;
  }
  return impliedFromAmerican(closingPrice) - impliedFromAmerican(postedPrice);
}

export function averageClv(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((n): n is number => n != null && Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function positiveClvRate(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((n): n is number => n != null && Number.isFinite(n));
  if (!nums.length) return null;
  return nums.filter((n) => n > 0).length / nums.length;
}
