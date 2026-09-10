import type { YachtDataSourceRow } from "../../data-matrix.ts";
import { SHARED_MARKET_MATRIX, SHARED_TEAM_MATRIX, unavailable } from "../../shared.ts";

export const YACHT_NFL_DATA_MATRIX: YachtDataSourceRow[] = [
  ...SHARED_MARKET_MATRIX,
  ...SHARED_TEAM_MATRIX,
  unavailable("EPA/play", "nflfastR / NFL tracking with as-of week. Not ESPN scoreboard."),
  unavailable("QB EPA/CPOE", "nflfastR EPA + CPOE. Point-in-time weekly dump."),
  unavailable("O-line / D-line", "PFF or similar — not licensed. Leave missing rather than invent."),
  unavailable("pace", "Plays per game from play-by-play, as-of week."),
  unavailable("explosive-play rates", "Play-by-play explosive run/pass rates."),
  unavailable("travel/timezone", "Miles / TZ from dated schedule."),
  unavailable("surface", "Stadium surface table keyed on venue."),
  {
    feature: "football weather",
    currentlyAvailable: "partial",
    currentSource: "ESPN weather string parsed for wind/temp/precip/dome when tokens exist",
    reliability: "low",
    timestampAvailable: "partial",
    historicalDataAvailable: "partial",
    liveDataAvailable: "partial",
    missing: false,
    recommendedFutureSource: "Structured wind/temp for outdoor sites only.",
  },
  {
    feature: "positional injuries",
    currentlyAvailable: "partial",
    currentSource: "ESPN injury board grouped QB/OL/WR/TE/RB/DL/LB/DB",
    reliability: "medium",
    timestampAvailable: "partial",
    historicalDataAvailable: "no",
    liveDataAvailable: "partial",
    missing: false,
    recommendedFutureSource: "Official injury report with known_at.",
  },
];
