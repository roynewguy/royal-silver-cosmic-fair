/** Authoritative source for each critical field. LLM text is never authoritative. */
export const SOURCE_HIERARCHY = {
  schedule: "espn",
  gameStatus: "espn",
  teams: "espn",
  scores: "espn",
  venue: "espn",
  probableStarters: "espn",
  injuries: "espn",
  weather: "espn",
  officialPrice: "odds-api:draftkings",
  probability: "boatboyz-v2",
  edge: "boatboyz-v2",
  confidence: "boatboyz-v2",
  units: "boatboyz-v2",
  explanation: "local-why",
} as const;

export const LLM_FORBIDDEN = [
  "odds",
  "injuries",
  "starters",
  "probability",
  "units",
  "edge",
  "confidence",
] as const;
