/** Documented research sources. None of these run inside the 10-minute production tick. */

export const RESEARCH_SOURCES = [
  {
    id: "espn-site-scoreboard",
    name: "ESPN site scoreboard",
    url: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=YYYYMMDD",
    provides: "schedule, scores, venue, probable pitchers (ERA/W-L), team records on the board",
    historicalDepth: "multi-year by date; unofficial undocumented API",
    rateLimits: "unpublished; cache by date and stay polite",
    cost: "free",
    terms: "Unofficial ESPN hidden API. No key. No SLA. Cache required.",
    usedFor: "historical_games, starters, labels",
  },
  {
    id: "espn-core-odds",
    name: "ESPN core competition odds",
    url: "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/{id}/competitions/{id}/odds",
    provides: "ESPN BET moneyline open/close, spread, total",
    historicalDepth: "available for many completed MLB games",
    rateLimits: "unpublished; one request per game when scoreboard odds are empty",
    cost: "free",
    terms: "Unofficial. This is ESPN BET, NOT verified DraftKings. Official BoatBoyz posts still require DK.",
    usedFor: "historical_odds opener + closer",
  },
  {
    id: "the-odds-api-historical",
    name: "The Odds API historical",
    url: "https://the-odds-api.com",
    provides: "DraftKings historical snapshots",
    historicalDepth: "paid historical plan",
    rateLimits: "credit-based",
    cost: "paid (optional, not wired)",
    terms: "Do not enable unless an operator opts in. Adapter stub only.",
    usedFor: "future DK historical overlay",
  },
] as const;

export const ODDS_API_HISTORICAL_ENABLED = false;
