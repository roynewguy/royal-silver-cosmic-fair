import { missing, spec, type SportFeatureContract } from "./spec.ts";

/** Separate from NFL. Do not reuse NFL coefficients. */
export const NCAAF_FEATURE_CONTRACT: SportFeatureContract = {
  sport: "ncaaf",
  displayName: "NCAAF",
  independentEngine: true,
  features: [
    missing("team_strength", "team strength", "ratings", "SP+/FPI as-of week. Not ESPN record string."),
    missing("off_efficiency", "offensive efficiency", "efficiency", "College PBP / SP+ as-of"),
    missing("def_efficiency", "defensive efficiency", "efficiency", "College PBP / SP+ as-of"),
    missing("epa_success", "EPA/success", "efficiency", "College play-by-play as-of week"),
    missing("qb", "QB", "qb", "College PBP QB EPA. Independent of NFL CPOE."),
    missing("explosiveness", "explosiveness", "efficiency", "College PBP explosive rates"),
    missing("line_play", "line play", "line", "Not licensed. Leave missing."),
    missing("strength_of_schedule", "strength of schedule", "ratings", "Dated SOS. Do not invent from win%."),
    spec({ key: "home_field", label: "home field", group: "context", availability: "available", source: "game card", usableAsFeature: true, notes: "Schedule-time known." }),
    missing("travel", "travel", "context", "College travel / timezone"),
    spec({ key: "rest_days", label: "rest", group: "context", availability: "partial", source: "prior finals", usableAsFeature: true, notes: "Start-to-start rest." }),
    spec({ key: "injuries", label: "injuries", group: "availability", availability: "partial", source: "ESPN injury board", usableAsFeature: true, notes: "College injury reporting is incomplete; missing → quality penalty." }),
    missing("pace", "pace", "efficiency", "Plays per game from college PBP"),
    spec({ key: "market_opener", label: "market information", group: "market", availability: "partial", source: "proven pregame two-way", usableAsFeature: true, usableAsStake: true, notes: "Independent NCAAF engine. No NFL weights." }),
    spec({ key: "team_form", label: "team form", group: "form", availability: "available", source: "historical_games priors", usableAsFeature: true, notes: "Baseline only." }),
  ],
};
