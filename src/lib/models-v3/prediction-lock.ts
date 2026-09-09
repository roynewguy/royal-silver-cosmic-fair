/** Predictions with a result, or official posted rows, are immutable. */
export function canRewritePrediction(row: { result?: string | null; official?: boolean | null; stage?: string }): boolean {
  if (row.result != null && row.result !== "") return false;
  if (row.official && row.stage === "posted") return false;
  return true;
}
