import { missing, spec, type SportFeatureContract } from "./spec.ts";

/** Separate engine from NBA. Same hoop gaps, independent version. */
export const WNBA_FEATURE_CONTRACT: SportFeatureContract = {
  sport: "wnba",
  displayName: "WNBA",
  independentEngine: true,
  features: [
    missing("ortg", "offensive rating", "ratings", "WNBA stats as-of. Not NBA coefficients."),
    missing("drtg", "defensive rating", "ratings", "WNBA stats as-of"),
    missing("net_rating", "net rating", "ratings", "Derived once ORtg/DRtg exist"),
    missing("pace", "pace", "ratings", "WNBA possessions as-of"),
    missing("efg", "effective FG%", "four-factors", "WNBA stats as-of"),
    missing("tov_rate", "turnover rate", "four-factors", "WNBA stats as-of"),
    missing("orb_rate", "offensive rebound rate", "four-factors", "WNBA stats as-of"),
    missing("ft_rate", "free-throw rate", "four-factors", "WNBA stats as-of"),
    missing("three_point_profile", "three-point profile", "shot", "WNBA 3PA/3P% as-of"),
    missing("lineup_availability", "lineup availability", "lineup", "Confirmed lineup"),
    missing("projected_minutes", "projected minutes", "lineup", "Do not invent."),
    spec({ key: "star_player_availability", label: "star-player availability", group: "availability", availability: "partial", source: "ESPN injury board", usableAsFeature: true, notes: "Independent WNBA engine." }),
    spec({ key: "rest_days", label: "rest", group: "context", availability: "partial", source: "prior finals", usableAsFeature: true, notes: "Start-to-start rest." }),
    spec({ key: "back_to_back", label: "back-to-back", group: "context", availability: "partial", source: "restDays from priors", usableAsFeature: true, notes: "0 ≈ B2B." }),
    missing("travel", "travel", "context", "WNBA schedule miles/timezone"),
    spec({ key: "home_road", label: "home/road", group: "context", availability: "available", source: "game card", usableAsFeature: true, notes: "Schedule-time known." }),
    spec({ key: "recent_form", label: "recent rolling performance", group: "form", availability: "available", source: "historical_games priors", usableAsFeature: true, notes: "Baseline form." }),
    spec({ key: "market_opener", label: "market opener", group: "market", availability: "partial", source: "proven pregame two-way", usableAsFeature: true, usableAsStake: true, notes: "Close is evaluation-only." }),
  ],
};
