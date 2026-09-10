import { missing, spec, type SportFeatureContract } from "./spec.ts";

/**
 * NFL feature contract. Independent engine from NCAAF and V2.
 * Missing advanced stats stay missing — never invent EPA/CPOE/PFF.
 */
export const NFL_FEATURE_CONTRACT: SportFeatureContract = {
  sport: "nfl",
  displayName: "NFL",
  independentEngine: true,
  features: [
    // TEAM STRENGTH — licensed PBP not in-repo
    missing("epa_off", "offensive EPA/play", "strength", "nflfastR / tracking with as-of week"),
    missing("epa_def", "defensive EPA/play", "strength", "nflfastR as-of week"),
    missing("early_down_epa", "early-down EPA/play", "strength", "Play-by-play early-down EPA as-of week"),
    missing("success_rate_off", "success rate offense", "strength", "Play-by-play success rate as-of"),
    missing("success_rate_def", "success rate defense", "strength", "Play-by-play defensive success rate as-of"),
    missing("explosive_play_rate", "explosive play rate", "strength", "Play-by-play explosive run/pass rates"),
    missing("opponent_adjusted_strength", "opponent-adjusted strength", "strength", "Opponent-adjusted EPA as-of week"),
    missing("rolling_epa_window", "recent rolling EPA windows", "strength", "nflfastR trailing-N with as-of week"),
    spec({ key: "team_form", label: "full-season / form priors", group: "form", availability: "available", source: "historical_games priors (win%, last5/10, point diff)", usableAsFeature: true, notes: "Baseline form. Not the whole model. Not EPA." }),

    // QB
    missing("qb_epa_dropback", "QB EPA/dropback", "qb", "nflfastR EPA/dropback as-of"),
    missing("cpoe", "CPOE", "qb", "nflfastR CPOE as-of week"),
    missing("pressure_performance", "pressure performance", "qb", "PFF / tracking. Not licensed."),
    missing("sack_avoidance", "sack avoidance", "qb", "PFF or tracking — not licensed"),
    missing("interception_rate", "interception rate", "qb", "nflfastR INT rate as-of"),
    missing("scramble_contribution", "scramble/rushing contribution", "qb", "nflfastR scramble EPA as-of"),
    spec({ key: "qb_identity", label: "QB starter identity", group: "qb", availability: "partial", source: "Injury board QB listing / starter field when dated", usableAsFeature: true, notes: "Name only when known_at is proven. Do not assume starter." }),
    spec({ key: "qb_confirmed", label: "QB starter confirmed", group: "qb", availability: "partial", source: "Injury board + starter listing", usableAsFeature: true, notes: "Unconfirmed QB increases uncertainty." }),
    spec({ key: "qb_backup_downgrade", label: "backup downgrade", group: "qb", availability: "partial", source: "QB OUT/doubtful on injury board", usableAsFeature: true, notes: "Missing board ≠ healthy starter." }),
    spec({ key: "qb_status", label: "QB injury status", group: "qb", availability: "partial", source: "ESPN injury board + injuriesFetchedAt", usableAsFeature: true, notes: "Uncertain QB lowers dataQuality." }),

    // OL / DL
    missing("pressure_allowed", "pressure allowed", "line", "PFF / tracking — not licensed"),
    missing("sack_rate_allowed", "sack rate allowed", "line", "PFF or nflfastR sack rate as-of"),
    missing("pressure_generated", "pressure generated", "line", "PFF — not licensed"),
    missing("sack_rate_generated", "sack rate generated", "line", "PFF or nflfastR as-of"),
    missing("run_block", "run-block indicator", "line", "PFF run-block. Leave missing."),
    missing("run_defense", "run-defense indicator", "line", "PFF run-defense. Leave missing."),
    spec({ key: "ol_injury_weight", label: "OL injury weight", group: "line", availability: "partial", source: "Position-weighted ESPN injury board", usableAsFeature: true, notes: "Not a PFF grade. Missing OL board → quality penalty." }),

    // PASS / RUN MATCHUP
    missing("pass_epa_matchup", "passing EPA offense vs pass defense", "matchup", "nflfastR pass EPA as-of"),
    missing("rush_epa_matchup", "rushing EPA offense vs rush defense", "matchup", "nflfastR rush EPA as-of"),
    missing("explosive_pass_rate", "explosive pass rate", "matchup", "Play-by-play explosive pass as-of"),
    missing("explosive_rush_rate", "explosive rush rate", "matchup", "Play-by-play explosive rush as-of"),
    missing("third_down_efficiency", "third-down efficiency", "matchup", "Play-by-play 3rd-down as-of. Not ESPN drive string."),

    // PACE
    missing("plays_per_game", "plays per game", "pace", "Play-by-play plays/game as-of week"),
    missing("neutral_pace", "neutral-situation pace", "pace", "nflfastR no-score-effect pace as-of"),
    missing("pass_rate", "pass rate", "pace", "Play-by-play pass rate as-of"),
    missing("projected_tempo", "projected game tempo", "pace", "Derived from both-team pace once those exist"),

    // INJURIES — positional weighting, not equal
    spec({ key: "injuries", label: "injuries", group: "availability", availability: "partial", source: "ESPN injury board + injuriesFetchedAt", usableAsFeature: true, notes: "Missing board → quality penalty." }),
    spec({ key: "injury_qb", label: "QB injuries", group: "availability", availability: "partial", source: "Injury board position=QB", usableAsFeature: true, notes: "Highest positional weight." }),
    spec({ key: "injury_ol", label: "OL injuries", group: "availability", availability: "partial", source: "LT/RT/G/C/OL on board", usableAsFeature: true, notes: "" }),
    spec({ key: "injury_wr", label: "WR injuries", group: "availability", availability: "partial", source: "WR on board", usableAsFeature: true, notes: "" }),
    spec({ key: "injury_te", label: "TE injuries", group: "availability", availability: "partial", source: "TE on board", usableAsFeature: true, notes: "" }),
    spec({ key: "injury_rb", label: "RB injuries", group: "availability", availability: "partial", source: "RB/FB on board", usableAsFeature: true, notes: "" }),
    spec({ key: "injury_dl", label: "DL injuries", group: "availability", availability: "partial", source: "DE/DT/NT/EDGE on board", usableAsFeature: true, notes: "" }),
    spec({ key: "injury_lb", label: "LB injuries", group: "availability", availability: "partial", source: "LB on board", usableAsFeature: true, notes: "" }),
    spec({ key: "injury_db", label: "secondary injuries", group: "availability", availability: "partial", source: "CB/S/DB on board", usableAsFeature: true, notes: "" }),
    missing("skill_player_availability", "depth-chart skill-player availability", "availability", "Injury report with known_at + depth chart"),

    // WEATHER
    spec({ key: "weather_string", label: "weather string", group: "weather", availability: "partial", source: "ESPN weather + weatherFetchedAt", usableAsFeature: true, notes: "Raw string with provenance." }),
    spec({ key: "wind_mph", label: "wind speed", group: "weather", availability: "partial", source: "Parsed from ESPN weather when numeric", usableAsFeature: true, notes: "Unparsed wind stays missing." }),
    spec({ key: "precipitation", label: "precipitation", group: "weather", availability: "partial", source: "rain/snow/shower tokens in weather string", usableAsFeature: true, notes: "" }),
    spec({ key: "temperature", label: "temperature", group: "weather", availability: "partial", source: "° token in weather string", usableAsFeature: true, notes: "" }),
    spec({ key: "dome", label: "dome/open-air", group: "weather", availability: "partial", source: "indoor/dome tokens in weather or venue", usableAsFeature: true, notes: "Do not invent a stadium table." }),
    missing("surface", "surface", "context", "Stadium surface table keyed on venue. Not invented from name."),
    missing("wind_structured", "structured wind for outdoor sites", "weather", "Dedicated wind feed. ESPN string is partial."),

    // REST / SITUATIONAL
    spec({ key: "rest_days", label: "days rest", group: "context", availability: "partial", source: "prior finals start-to-start", usableAsFeature: true, notes: "" }),
    spec({ key: "short_week", label: "short week", group: "context", availability: "partial", source: "restDays <= 5 from priors", usableAsFeature: true, notes: "" }),
    spec({ key: "thursday_game", label: "Thursday game", group: "context", availability: "available", source: "fixture startAt weekday (America/New_York)", usableAsFeature: true, notes: "Structural fixture field, not a sourced stat." }),
    spec({ key: "bye_week", label: "bye week rest", group: "context", availability: "partial", source: "restDays >= 13 from priors", usableAsFeature: true, notes: "" }),
    missing("overtime_previous_week", "overtime previous week", "context", "Prior game OT flag with known_at. ESPN score alone is not OT proof."),
    missing("travel_distance", "travel distance", "context", "Miles from dated schedule"),
    missing("timezone_shift", "timezone shift", "context", "TZ from dated schedule"),
    spec({ key: "home_field", label: "home field", group: "context", availability: "available", source: "fixture (home team on the row)", usableAsFeature: true, notes: "Structural. Neutral-field flag stays missing unless sourced." }),
    missing("neutral_field", "neutral field", "context", "Schedule neutral-site flag."),

    // MARKET — close is evaluation-only
    spec({ key: "market_opener", label: "DraftKings opener", group: "market", availability: "partial", source: "proven openCapturedAt two-way", usableAsFeature: true, usableAsStake: true, notes: "Unproven openers are not features or stakes." }),
    spec({ key: "market_current", label: "current DraftKings line", group: "market", availability: "partial", source: "proven capturedAt two-way", usableAsFeature: true, notes: "Close is evaluation-only." }),
    spec({ key: "market_both_sides", label: "both sides prices", group: "market", availability: "partial", source: "two-way DK quotes", usableAsFeature: true, notes: "One-sided is not no-vig." }),
    spec({ key: "spread", label: "spread", group: "market", availability: "partial", source: "DK spread + capturedAt", usableAsFeature: true, notes: "Live only when timestamped. Not a training target here." }),
    spec({ key: "total", label: "total", group: "market", availability: "partial", source: "DK total + capturedAt", usableAsFeature: true, notes: "Live only when timestamped. Total modeling is a later target." }),
    spec({ key: "line_movement", label: "line movement", group: "market", availability: "partial", source: "proven open vs proven current", usableAsFeature: true, notes: "Close is not a move endpoint." }),
    spec({
      key: "closing_line",
      label: "closing line",
      group: "market",
      availability: "partial",
      source: "closeCapturedAt evaluation-only",
      usableAsFeature: false,
      notes: "NEVER a prediction feature or stake fallback.",
    }),
  ],
};
