/**
 * Model Yacht MLB data-source matrix.
 * Missing is better than fake. Nothing here scrapes a new site or invents numbers.
 */

export type MatrixAvailability = "yes" | "partial" | "no";

export type YachtDataSourceRow = {
  feature: string;
  currentlyAvailable: MatrixAvailability;
  currentSource: string;
  reliability: "high" | "medium" | "low" | "none";
  timestampAvailable: MatrixAvailability;
  historicalDataAvailable: MatrixAvailability;
  liveDataAvailable: MatrixAvailability;
  missing: boolean;
  recommendedFutureSource: string;
};

export const YACHT_MLB_DATA_MATRIX: YachtDataSourceRow[] = [
  { feature: "FIP", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Baseball Savant pitcher page with as-of date. Not ESPN scoreboard." },
  { feature: "xFIP", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Baseball Savant. Point-in-time dump required." },
  { feature: "SIERA", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs SIERA with as-of date." },
  { feature: "K-BB%", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Savant pitcher splits." },
  { feature: "pitcher K%", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Savant." },
  { feature: "pitcher BB%", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Savant." },
  { feature: "HR/9 or HR rate", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Savant." },
  { feature: "wRC+", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs team/player offense with as-of date." },
  { feature: "handedness splits", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Savant platoon splits." },
  { feature: "recent starter workload", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "Pitcher game log (pitches / innings last start) with known_at = game final." },
  { feature: "pitch count / rest", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "Pitcher game log. Team restDays is available separately from priors." },
  { feature: "bullpen workload", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "Team bullpen IP last 1/3/7 days from game logs." },
  { feature: "bullpen innings last 1/3/7 days", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "Retrosheet / MLB Stats API box innings, not invented." },
  { feature: "high-leverage reliever usage", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "Play-by-play leverage + pitcher roles." },
  { feature: "closer/setup availability", currentlyAvailable: "partial", currentSource: "ESPN injury board + player-impact roles (if listed)", reliability: "low", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: true, recommendedFutureSource: "Injury board is live; role/value is incomplete. Do not invent closer names." },
  { feature: "team OPS/OBP/SLG", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "FanGraphs / Baseball Reference team batting as-of." },
  { feature: "confirmed lineup", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "MLB official lineup card with posted timestamp." },
  { feature: "player offensive value", currentlyAvailable: "partial", currentSource: "player-impact.ts role weights from injury position (not WAR/wOBA)", reliability: "low", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "yes", missing: true, recommendedFutureSource: "Do not invent WAR. Keep missing-value penalty." },
  { feature: "park factor", currentlyAvailable: "no", currentSource: "venue name only (ESPN scoreboard)", reliability: "none", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: true, recommendedFutureSource: "Static park-factor table keyed on venue. Name is available; numeric factor is not." },
  { feature: "park / venue name", currentlyAvailable: "yes", currentSource: "ESPN site scoreboard venue", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Keep ESPN venue; do not invent factors from the name." },
  { feature: "structured temperature", currentlyAvailable: "no", currentSource: "ESPN weather is a free-text string", reliability: "none", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: true, recommendedFutureSource: "Parse ESPN weather only when the number is explicit; else leave missing." },
  { feature: "wind speed/direction", currentlyAvailable: "no", currentSource: "ESPN weather string (MLB). NFL parser exists, MLB is unstructured.", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "Structured weather feed or a proven MLB parser. Do not guess from the string." },
  { feature: "humidity", currentlyAvailable: "no", currentSource: "none", reliability: "none", timestampAvailable: "no", historicalDataAvailable: "no", liveDataAvailable: "no", missing: true, recommendedFutureSource: "Weather API with observation timestamp." },
  { feature: "weather string", currentlyAvailable: "partial", currentSource: "ESPN GameCard.weather", reliability: "low", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Keep as a raw string feature with known_at = weatherFetchedAt." },
  { feature: "travel/rest", currentlyAvailable: "partial", currentSource: "team restDays from prior finals in historical_games (start-to-start)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "RestDays is leak-safe from priors. Travel miles / timezone are not available." },
  { feature: "doubleheader status", currentlyAvailable: "partial", currentSource: "separate ESPN game ids; no explicit DH flag", reliability: "low", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: true, recommendedFutureSource: "Flag same-team same-PT-day games. Do not assume DH from venue alone." },
  { feature: "opening market", currentlyAvailable: "partial", currentSource: "ESPN BET nested open (historical). Live DK first-seen via dk-open (home+away).", reliability: "medium", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "The Odds API historical (paid, stubbed, ODDS_API_HISTORICAL_ENABLED=false). Do not use close as open." },
  { feature: "current market", currentlyAvailable: "yes", currentSource: "The Odds API DraftKings snapshot + ESPN listed ML", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Keep DK as official current. Preserve both sides." },
  { feature: "DraftKings", currentlyAvailable: "yes", currentSource: "The Odds API bookmaker=draftkings (live). Historical plan not wired.", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Paid Odds API historical if operator opts in. Never scrape DK HTML." },
  { feature: "FanDuel", currentlyAvailable: "partial", currentSource: "Odds API event bookmakers → market-consensus (live scan only)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Same Odds API event payload. Not official BoatBoyz stake." },
  { feature: "BetMGM", currentlyAvailable: "partial", currentSource: "Odds API event bookmakers → market-consensus (live scan only)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Same Odds API event payload." },
  { feature: "Caesars", currentlyAvailable: "partial", currentSource: "Odds API williamhill_us → market-consensus (live scan only)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Same Odds API event payload." },
  { feature: "consensus probability", currentlyAvailable: "partial", currentSource: "buildMarketConsensus (DK/FD/MGM/Caesars two-way no-vig)", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Only when quotesFromEvent returns 2+ two-way books." },
  { feature: "market dispersion", currentlyAvailable: "partial", currentSource: "MarketConsensus.dispersion", reliability: "medium", timestampAvailable: "yes", historicalDataAvailable: "no", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Keep; missing books → missing, not 0." },
  { feature: "line movement", currentlyAvailable: "partial", currentSource: "open vs current implied (home). Needs both sides + timestamps.", reliability: "medium", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "partial", missing: false, recommendedFutureSource: "Move only when open and current are proven pregame. Close is not a move endpoint for features." },
  { feature: "team form last 5 / last 10 / run diff", currentlyAvailable: "yes", currentSource: "historical_games priors via teamFeatures (finals only)", reliability: "high", timestampAvailable: "yes", historicalDataAvailable: "yes", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Reuse. Yacht adds a prior-completion buffer so same-day unfinished games cannot leak." },
  { feature: "starting pitcher name", currentlyAvailable: "partial", currentSource: "ESPN probable", reliability: "medium", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Live: startersFetchedAt. Historical dump ERA/name is NOT proven pregame — Model Yacht marks unproven." },
  { feature: "starting pitcher ERA / WHIP", currentlyAvailable: "partial", currentSource: "ESPN probable season ERA/WHIP", reliability: "low", timestampAvailable: "no", historicalDataAvailable: "partial", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "Unproven point-in-time historically. Live may use current probable with startersFetchedAt. Never backfill from postgame." },
  { feature: "injuries", currentlyAvailable: "yes", currentSource: "ESPN injury board + player-impact", reliability: "medium", timestampAvailable: "partial", historicalDataAvailable: "partial", liveDataAvailable: "yes", missing: false, recommendedFutureSource: "known_at = injuriesFetchedAt. Missing board → PASS-quality penalty, not invented outs." },
];

export function missingFeatures(): string[] {
  return YACHT_MLB_DATA_MATRIX.filter((r) => r.missing && r.currentlyAvailable === "no").map((r) => r.feature);
}

export function availableFeatures(): string[] {
  return YACHT_MLB_DATA_MATRIX.filter((r) => r.currentlyAvailable !== "no").map((r) => r.feature);
}
