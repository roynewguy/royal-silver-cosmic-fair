export { mapStatus, parseCoreOdds, parseStarter, seasonOf, ymdList } from "../parse.ts";
import { parseScoreboardEvent as parseAll } from "../parse.ts";
import type { HistoricalGame, StarterFeat } from "../types.ts";

export function parseScoreboardEvent(event: {
  id?: string;
  date?: string;
  competitions?: never[];
}): { game: HistoricalGame; starters: { home: StarterFeat; away: StarterFeat } } | null {
  return parseAll(event, { id: "mlb", sport: "MLB" })[0] ?? null;
}
