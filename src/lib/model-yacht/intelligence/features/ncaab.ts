import { missing, spec, type SportFeatureContract } from "./spec.ts";

/** Dedicated NCAAB contract. Not a generic fallback. KenPom-class ratings stay missing. */
export const NCAAB_FEATURE_CONTRACT: SportFeatureContract = {
  sport: "ncaab",
  displayName: "NCAAB",
  independentEngine: true,
  features: [
    missing("adj_off", "adjusted offensive efficiency", "ratings", "KenPom / Barttorvik as-of. Not licensed here."),
    missing("adj_def", "adjusted defensive efficiency", "ratings", "KenPom / Barttorvik as-of"),
    missing("tempo", "tempo", "ratings", "Possessions/game from a dated efficiency feed"),
    missing("efg", "effective FG%", "four-factors", "Dated four factors. Not ESPN score."),
    missing("tov_pct", "turnover%", "four-factors", "TOV% as-of"),
    missing("orb_pct", "offensive rebounding%", "four-factors", "OR% as-of"),
    missing("ft_rate", "free throw rate", "four-factors", "FTR as-of"),
    missing("three_point_profile", "three-point profile", "shot", "3PA rate / 3P% as-of"),
    missing("strength_of_schedule", "strength of schedule", "ratings", "Dated SOS. Do not invent from win%."),
    spec({ key: "home_court", label: "home court", group: "context", availability: "available", source: "game card", usableAsFeature: true, notes: "True home. Neutral is separate." }),
    missing("neutral_court", "neutral court", "context", "Explicit neutral-site flag from schedule"),
    spec({ key: "rest_days", label: "rest", group: "context", availability: "partial", source: "prior finals", usableAsFeature: true, notes: "Start-to-start rest." }),
    missing("travel", "travel", "context", "College travel / timezone"),
    spec({ key: "injuries", label: "injuries where reliable", group: "availability", availability: "partial", source: "ESPN injury board", usableAsFeature: true, notes: "College reporting is incomplete." }),
    spec({ key: "market_opener", label: "market opener", group: "market", availability: "partial", source: "proven pregame two-way", usableAsFeature: true, usableAsStake: true, notes: "Close is evaluation-only." }),
    spec({ key: "team_form", label: "team form", group: "form", availability: "available", source: "historical_games priors", usableAsFeature: true, notes: "Baseline only. Not KenPom." }),
  ],
};
