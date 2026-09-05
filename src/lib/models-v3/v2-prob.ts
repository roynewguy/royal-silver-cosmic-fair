export function v2HomeProbability(input: { market: string; side: string; modelProbability: number | null }): number | null {
  if (input.market !== "moneyline" || input.modelProbability == null) return null;
  if (input.side === "home") return input.modelProbability;
  if (input.side === "away") return 1 - input.modelProbability;
  return null;
}
