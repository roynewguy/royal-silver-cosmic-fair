import { missing, spec, type SportFeatureContract } from "./spec.ts";

/** Replaces win-percentage-only logic as a contract. Fighter stats stay missing until dated. */
export const UFC_FEATURE_CONTRACT: SportFeatureContract = {
  sport: "ufc",
  displayName: "UFC",
  independentEngine: true,
  features: [
    missing("sig_strikes_landed_min", "significant strikes landed/min", "striking", "UFC stats with as-of date"),
    missing("sig_strikes_absorbed_min", "significant strikes absorbed/min", "striking", "UFC stats as-of"),
    missing("strike_differential", "strike differential", "striking", "Derived once both SLpM exist"),
    missing("strike_accuracy", "strike accuracy", "striking", "UFC stats as-of"),
    missing("strike_defense", "strike defense", "striking", "UFC stats as-of"),
    missing("td_per_15", "takedowns/15", "grappling", "UFC stats TD/15 as-of"),
    missing("td_accuracy", "takedown accuracy", "grappling", "UFC stats as-of"),
    missing("td_defense", "takedown defense", "grappling", "UFC stats TD def as-of"),
    missing("submission_attempts", "submission attempts", "grappling", "UFC stats as-of"),
    missing("control_grappling", "control/grappling measures", "grappling", "Control time as-of"),
    missing("reach", "reach", "bio", "UFC fighter bio with known_at"),
    missing("height", "height", "bio", "UFC fighter bio with known_at"),
    missing("age", "age", "bio", "UFC fighter bio with known_at"),
    missing("stance", "stance", "bio", "UFC fighter bio with known_at"),
    missing("weight_class", "weight class", "context", "Division + cut notes. Not on current GameCard."),
    spec({ key: "fight_experience", label: "fight experience", group: "form", availability: "missing", source: "none", usableAsFeature: false, notes: "Prior UFC cards can later supply this from historical_games. Not invented." }),
    spec({ key: "recent_performance", label: "recent performance", group: "form", availability: "partial", source: "historical_games fight priors", usableAsFeature: true, notes: "Win/loss priors only. Not opponent-adjusted." }),
    missing("layoff_duration", "layoff duration", "form", "Days since last fight from prior UFC cards"),
    missing("weight_miss", "weight misses", "context", "Commission miss with timestamp. Unreliable otherwise."),
    missing("short_notice", "short-notice replacement", "context", "Replacement flag with known_at"),
    spec({ key: "fighter_identity", label: "fighter identity", group: "identity", availability: "available", source: "ESPN fight card names", usableAsFeature: true, notes: "Names only. Never fabricate fighter information." }),
    spec({ key: "market_opener", label: "market opener", group: "market", availability: "partial", source: "proven pregame two-way", usableAsFeature: true, usableAsStake: true, notes: "Close is evaluation-only." }),
  ],
};
