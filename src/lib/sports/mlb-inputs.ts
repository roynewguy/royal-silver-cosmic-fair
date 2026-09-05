/** Audit only. Do not invent stats or retune V2 weights from this list. */
export const MLB_V2_INPUTS = {
  available: [
    "season win %",
    "home/road splits when ESPN sends them",
    "starting pitcher name (probable)",
    "starting pitcher ERA",
    "starting pitcher WHIP",
    "injuries (ESPN injury board)",
    "park/venue name",
    "weather string when ESPN sends it",
    "current moneyline / spread / total",
    "opening home ML / spread / total when present",
    "DraftKings line at verify (official only)",
  ],
  missing: [
    { input: "last 5 / last 10", source: "Rebuild from game_history priors (same as V3 live features)." },
    { input: "run differential", source: "Prior finals in game_history / historical_games." },
    { input: "FIP / xFIP", source: "Fangraphs or Baseball Savant, not ESPN scoreboard." },
    { input: "K% / BB%", source: "Fangraphs / Baseball Savant pitcher pages." },
    { input: "recent starts", source: "Pitcher game log; not on current GameCard." },
    { input: "bullpen ERA / workload", source: "Team bullpen splits; not on current GameCard." },
    { input: "high-leverage reliever availability", source: "Injury + usage feed." },
    { input: "OPS / lineup strength", source: "Confirmed lineup + season offense stats." },
    { input: "park factors", source: "Static park-factor table keyed on venue." },
    { input: "wind direction (usable)", source: "Parse ESPN weather; NFL parser exists, MLB is a string." },
  ],
  productionWeightsFrozen: [
    "0.5 + (homeW - awayW) * 0.16 + 0.038",
    "ERA diff * 0.032 when both exist",
    "injuryDelta(mlb)",
  ],
} as const;
