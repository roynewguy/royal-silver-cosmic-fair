import type { YachtQuote } from "./types.ts";

/** True opener = earliest proven (timestamped, not evaluation-only) quote for that key. */
export function trueOpener(
  quotes: YachtQuote[],
  key: { sportsbook: string; market: string; side: string },
): YachtQuote | null {
  const proven = quotes
    .filter(
      (q) =>
        q.sportsbook === key.sportsbook &&
        q.market === key.market &&
        q.side === key.side &&
        q.provenanceOk &&
        q.capturedAt != null &&
        !q.evaluationOnly &&
        q.role !== "close",
    )
    .sort((a, b) => Date.parse(a.capturedAt!) - Date.parse(b.capturedAt!) || a.quoteId.localeCompare(b.quoteId));
  return proven[0] ?? null;
}

export function claimedOpenWithoutTimestamp(quotes: YachtQuote[]): YachtQuote[] {
  return quotes.filter((q) => q.role === "open_claimed" && !q.provenanceOk);
}
