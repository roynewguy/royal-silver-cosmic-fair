import type { SportId } from "./types.ts";

export type LeagueConfig = {
  id: SportId;
  sport: string;
  espnSport: string;
  espnLeague: string;
  kind: "spread" | "moneyline";
  homeAdv: number;
  ptsPerWin: number;
  daily: boolean;
  lookAheadDays: number;
  avgTotal: number | null;
  official: boolean;
  soccer3way: boolean;
  oddsApiKey: string | null;
};

export const LEAGUES: LeagueConfig[] = [
  {
    id: "nfl",
    sport: "NFL",
    espnSport: "football",
    espnLeague: "nfl",
    kind: "spread",
    homeAdv: 0.03,
    ptsPerWin: 28,
    daily: false,
    lookAheadDays: 12,
    avgTotal: 44.5,
    official: true,
    soccer3way: false,
    oddsApiKey: "americanfootball_nfl",
  },
  {
    id: "ncaaf",
    sport: "NCAAF",
    espnSport: "football",
    espnLeague: "college-football",
    kind: "spread",
    homeAdv: 0.035,
    ptsPerWin: 32,
    daily: false,
    lookAheadDays: 7,
    avgTotal: 52,
    official: true,
    soccer3way: false,
    oddsApiKey: "americanfootball_ncaaf",
  },
  {
    id: "mlb",
    sport: "MLB",
    espnSport: "baseball",
    espnLeague: "mlb",
    kind: "moneyline",
    homeAdv: 0.04,
    ptsPerWin: 3.2,
    daily: true,
    lookAheadDays: 2,
    avgTotal: 8.5,
    official: true,
    soccer3way: false,
    oddsApiKey: "baseball_mlb",
  },
  {
    id: "mls",
    sport: "MLS",
    espnSport: "soccer",
    espnLeague: "usa.1",
    kind: "moneyline",
    homeAdv: 0.08,
    ptsPerWin: 1.4,
    daily: true,
    lookAheadDays: 3,
    avgTotal: null,
    official: false,
    soccer3way: true,
    oddsApiKey: "soccer_usa_mls",
  },
  {
    id: "epl",
    sport: "EPL",
    espnSport: "soccer",
    espnLeague: "eng.1",
    kind: "moneyline",
    homeAdv: 0.08,
    ptsPerWin: 1.4,
    daily: true,
    lookAheadDays: 3,
    avgTotal: null,
    official: false,
    soccer3way: true,
    oddsApiKey: "soccer_epl",
  },
  {
    id: "nhl",
    sport: "NHL",
    espnSport: "hockey",
    espnLeague: "nhl",
    kind: "moneyline",
    homeAdv: 0.045,
    ptsPerWin: 2.4,
    daily: true,
    lookAheadDays: 3,
    avgTotal: 6,
    official: true,
    soccer3way: false,
    oddsApiKey: "icehockey_nhl",
  },
  {
    id: "nba",
    sport: "NBA",
    espnSport: "basketball",
    espnLeague: "nba",
    kind: "spread",
    homeAdv: 0.04,
    ptsPerWin: 18,
    daily: true,
    lookAheadDays: 3,
    avgTotal: 224,
    official: true,
    soccer3way: false,
    oddsApiKey: "basketball_nba",
  },
  {
    id: "wnba",
    sport: "WNBA",
    espnSport: "basketball",
    espnLeague: "wnba",
    kind: "spread",
    homeAdv: 0.04,
    ptsPerWin: 16,
    daily: true,
    lookAheadDays: 3,
    avgTotal: 162,
    official: true,
    soccer3way: false,
    oddsApiKey: "basketball_wnba",
  },
  {
    id: "ncaab",
    sport: "NCAAB",
    espnSport: "basketball",
    espnLeague: "mens-college-basketball",
    kind: "spread",
    homeAdv: 0.05,
    ptsPerWin: 20,
    daily: true,
    lookAheadDays: 3,
    avgTotal: 142,
    official: true,
    soccer3way: false,
    oddsApiKey: "basketball_ncaab",
  },
  {
    id: "ufc",
    sport: "UFC",
    espnSport: "mma",
    espnLeague: "ufc",
    kind: "moneyline",
    homeAdv: 0,
    ptsPerWin: 0,
    daily: false,
    lookAheadDays: 8,
    avgTotal: null,
    official: true,
    soccer3way: false,
    oddsApiKey: "mma_mixed_martial_arts",
  },
];

export const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map((l) => [l.id, l])) as Record<
  SportId,
  LeagueConfig
>;

export function isSportId(v: string): v is SportId {
  return v in LEAGUE_BY_ID;
}
