/** Never return provider bodies, request URLs or credentials to logs/UI. */
export function safeOddsError(error: unknown): string {
  const match = error instanceof Error ? /^Odds API (\d{3})$/.exec(error.message) : null;
  const status = match?.[1];
  if (status === "401") return "Odds API rejected authentication (401). Check the production API key and subscription.";
  if (status === "403") return "Odds API denied access (403). Check subscription access.";
  if (status === "429") return "Odds API rate or quota limit (429). Check provider usage.";
  if (status) return `Odds API request failed (HTTP ${status}).`;
  return "Odds API connection failed or timed out. No verified odds available.";
}
