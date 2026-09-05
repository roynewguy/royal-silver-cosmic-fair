import { LEAGUE_BY_ID, type LeagueConfig } from "../sports/leagues.ts";

export type ResearchSport = {
  id: string;
  production: string;
  shadowPrefix: string;
  minPrior: number;
  from: string;
  to: string;
  trainTo: string;
  validTo: string;
  groups?: string;
};

export const RESEARCH_SPORTS: ResearchSport[] = [
  { id: "mlb", production: "v2-mlb", shadowPrefix: "v3-mlb", minPrior: 10, from: "2025-04-01", to: "2026-09-04", trainTo: "2025-07-31T23:59:59Z", validTo: "2025-12-31T23:59:59Z" },
  { id: "nba", production: "v2-nba", shadowPrefix: "v3-nba", minPrior: 10, from: "2024-10-22", to: "2026-06-20", trainTo: "2025-02-15T23:59:59Z", validTo: "2025-06-30T23:59:59Z" },
  { id: "nhl", production: "v2-nhl", shadowPrefix: "v3-nhl", minPrior: 10, from: "2024-10-08", to: "2026-06-20", trainTo: "2025-02-15T23:59:59Z", validTo: "2025-06-30T23:59:59Z" },
  { id: "nfl", production: "v2-nfl", shadowPrefix: "v3-nfl", minPrior: 4, from: "2024-09-05", to: "2026-09-04", trainTo: "2025-01-12T23:59:59Z", validTo: "2025-02-20T23:59:59Z" },
  { id: "ncaaf", production: "v2-ncaaf", shadowPrefix: "v3-ncaaf", minPrior: 4, from: "2024-08-24", to: "2026-09-04", trainTo: "2024-11-30T23:59:59Z", validTo: "2025-01-21T23:59:59Z", groups: "80" },
  { id: "wnba", production: "v2-wnba", shadowPrefix: "v3-wnba", minPrior: 8, from: "2025-05-16", to: "2026-09-04", trainTo: "2025-07-20T23:59:59Z", validTo: "2025-10-20T23:59:59Z" },
  { id: "ncaab", production: "v2-ncaab", shadowPrefix: "v3-ncaab", minPrior: 8, from: "2024-11-04", to: "2026-04-10", trainTo: "2025-02-01T23:59:59Z", validTo: "2025-04-10T23:59:59Z", groups: "50" },
  { id: "ufc", production: "v2-ufc", shadowPrefix: "v3-ufc", minPrior: 1, from: "2024-01-01", to: "2026-09-04", trainTo: "2025-12-31T23:59:59Z", validTo: "2026-03-31T23:59:59Z" },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH_SPORTS.map((s) => [s.id, s]));

export function researchLeague(id: string): LeagueConfig | null {
  return LEAGUE_BY_ID[id as keyof typeof LEAGUE_BY_ID] ?? null;
}

export function officialResearchSports(): ResearchSport[] {
  return RESEARCH_SPORTS.filter((s) => researchLeague(s.id)?.official);
}
