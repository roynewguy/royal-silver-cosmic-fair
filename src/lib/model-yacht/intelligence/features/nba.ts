import { missing, spec, type SportFeatureContract } from "./spec.ts";

export const NBA_FEATURE_CONTRACT: SportFeatureContract = {
  sport: "nba",
  displayName: "NBA",
  independentEngine: true,
  features: [
    missing("ortg", "offensive rating", "ratings", "NBA stats team ratings as-of date"),
    missing("drtg", "defensive rating", "ratings", "NBA stats as-of date"),
    missing("net_rating", "net rating", "ratings", "Derived from ORtg/DRtg once those exist"),
    missing("pace", "pace", "ratings", "Possessions per 48 from NBA stats as-of"),
    missing("efg", "effective FG%", "four-factors", "NBA stats as-of"),
    missing("tov_rate", "turnover rate", "four-factors", "NBA stats as-of"),
    missing("orb_rate", "offensive rebound rate", "four-factors", "NBA stats as-of"),
    missing("ft_rate", "free-throw rate", "four-factors", "NBA stats as-of"),
    missing("three_point_profile", "three-point profile", "shot", "3PA rate / 3P% as-of"),
    missing("lineup_availability", "lineup availability", "lineup", "Confirmed lineup + net rating"),
    missing("projected_minutes", "projected minutes", "lineup", "Not on GameCard. Do not invent."),
    spec({ key: "star_player_availability", label: "star-player availability", group: "availability", availability: "partial", source: "ESPN injury board", usableAsFeature: true, notes: "OUT/Doubtful only when injuriesFetchedAt is proven." }),
    spec({ key: "rest_days", label: "rest", group: "context", availability: "partial", source: "prior finals", usableAsFeature: true, notes: "0 ≈ back-to-back." }),
    spec({ key: "back_to_back", label: "back-to-back", group: "context", availability: "partial", source: "restDays from priors", usableAsFeature: true, notes: "Explicit B2B flag later. Do not invent travel B2B." }),
    missing("travel", "travel", "context", "Miles / timezone from dated NBA schedule"),
    spec({ key: "home_road", label: "home/road", group: "context", availability: "available", source: "game card", usableAsFeature: true, notes: "Schedule-time known." }),
    spec({ key: "recent_form", label: "recent rolling performance", group: "form", availability: "available", source: "historical_games priors", usableAsFeature: true, notes: "last5/last10 from completed games." }),
    spec({ key: "market_opener", label: "market opener", group: "market", availability: "partial", source: "proven pregame two-way", usableAsFeature: true, usableAsStake: true, notes: "Close is evaluation-only." }),
  ],
};
