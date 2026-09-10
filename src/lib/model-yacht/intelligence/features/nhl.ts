import { missing, spec, type SportFeatureContract } from "./spec.ts";

export const NHL_FEATURE_CONTRACT: SportFeatureContract = {
  sport: "nhl",
  displayName: "NHL",
  independentEngine: true,
  features: [
    missing("xg", "xG", "shot", "Natural Stat Trick / NHL edge with as-of date"),
    missing("xga", "xG against", "shot", "NST / NHL edge as-of"),
    missing("shot_quality", "shot quality", "shot", "Unblocked shot / xG models. Not ESPN SOG."),
    missing("corsi_share", "shots/attempt share", "possession", "Corsi/xGF. Not ESPN."),
    missing("special_teams", "special teams", "special", "PP/PK as-of"),
    missing("pp_pct", "PP%", "special", "Power-play % as-of"),
    missing("pk_pct", "PK%", "special", "Penalty-kill % as-of"),
    spec({ key: "goalie_confirmed", label: "goalie confirmed status", group: "goalie", availability: "partial", source: "ESPN probable starter", usableAsFeature: true, notes: "Unconfirmed goalie is missing, not assumed." }),
    missing("goalie_save_quality", "goalie save quality", "goalie", "Confirmed starter + GSAx as-of"),
    spec({ key: "rest_days", label: "rest", group: "context", availability: "partial", source: "prior finals", usableAsFeature: true, notes: "Start-to-start rest." }),
    spec({ key: "back_to_back", label: "back-to-back", group: "context", availability: "partial", source: "restDays from priors", usableAsFeature: true, notes: "0 ≈ B2B." }),
    missing("travel", "travel", "context", "NHL schedule miles/timezone"),
    spec({ key: "injuries", label: "injuries", group: "availability", availability: "partial", source: "ESPN injury board", usableAsFeature: true, notes: "Missing board → quality penalty." }),
    spec({ key: "recent_form", label: "recent form", group: "form", availability: "available", source: "historical_games priors", usableAsFeature: true, notes: "Baseline form." }),
    spec({ key: "home_ice", label: "home ice", group: "context", availability: "available", source: "game card", usableAsFeature: true, notes: "Schedule-time known." }),
    spec({ key: "market_opener", label: "market opener", group: "market", availability: "partial", source: "proven pregame two-way", usableAsFeature: true, usableAsStake: true, notes: "Close is evaluation-only." }),
  ],
};
