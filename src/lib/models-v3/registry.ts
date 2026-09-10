import type { ModelCard, ModelRole, ModelStatus } from "../sports/types.ts";

/** Production BoatBoyz always uses V2. V3/V4 are shadow/research only until an operator promotes AND live posting is explicitly unlocked. */
export const PRODUCTION_MODELS: Record<string, string> = {
  mlb: "v2-mlb",
  nba: "v2-nba",
  nfl: "v2-nfl",
  nhl: "v2-nhl",
  ncaaf: "v2-ncaaf",
  wnba: "v2-wnba",
  ncaab: "v2-ncaab",
  ufc: "v2-ufc",
};

export const CHALLENGER_SPORTS = ["mlb", "nfl", "nba", "nhl", "ncaaf", "wnba"] as const;

export type RegistryEntry = {
  modelName: string;
  modelVersion: string;
  sport: string;
  status: ModelStatus;
  role: ModelRole;
  trainingPeriod: string | null;
  features: string[];
  notes: string;
};

export const DEFAULT_REGISTRY: RegistryEntry[] = [
  ...Object.entries(PRODUCTION_MODELS).map(([sport, modelVersion]) => ({
    modelName: `V2 ${sport.toUpperCase()}`,
    modelVersion,
    sport,
    status: "production" as const,
    role: "champion" as const,
    trainingPeriod: "live heuristic",
    features: ["records", "starters", "injuries", "market", "home split"],
    notes: "Live champion. Official Discord posts.",
  })),
  ...CHALLENGER_SPORTS.map((sport) => ({
    modelName: `V3 ${sport.toUpperCase()}`,
    modelVersion: `v3-${sport}-logreg`,
    sport,
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "walk-forward logreg",
    features: ["winpct", "last5", "last10", "run/goal diff", "rest", "starter era/sv%"],
    notes: "Paper/shadow only. NFL historical results are not strong enough to promote.",
  })),
  ...CHALLENGER_SPORTS.map((sport) => ({
    modelName: `V4 Shadow Ensemble ${sport.toUpperCase()}`,
    modelVersion: `v4-${sport}-ensemble`,
    sport,
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "hardcoded 35/35/30 mix of V2+V3+market",
    features: ["v2 probability", "v3 probability", "no-vig market", "whip/goalie/injuries", "line move", "data quality"],
    notes: "Shadow ensemble prototype. Weights are not learned. Paper only. Never auto-promoted.",
  })),
  {
    modelName: "Model Yacht MLB logreg",
    modelVersion: "model-yacht-mlb-logreg-2026.09.1",
    sport: "mlb",
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "walk-forward logreg (research)",
    features: ["form", "rest", "starter ERA when proven", "no-vig opener when proven"],
    notes: "Intelligence challenger. official=false. Cannot post Discord. V2 remains champion.",
  },
  {
    modelName: "Model Yacht MLB GBT",
    modelVersion: "model-yacht-mlb-gbt-2026.09.1",
    sport: "mlb",
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "walk-forward gradient boosted trees (research)",
    features: ["same MLB contract as logreg; missing FIP/xFIP stay missing"],
    notes: "Intelligence challenger. Shadow only. Never auto-promoted.",
  },
  {
    modelName: "Model Yacht MLB market",
    modelVersion: "model-yacht-mlb-market-2026.09.1",
    sport: "mlb",
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "sportsbook no-vig baseline",
    features: ["proven two-way no-vig only"],
    notes: "Market baseline candidate. Close is evaluation-only.",
  },
  {
    modelName: "Model Yacht NFL logreg",
    modelVersion: "model-yacht-nfl-logreg-2026.09.2",
    sport: "nfl",
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "walk-forward logreg (research)",
    features: ["form", "rest", "positional injuries", "QB status", "weather when proven", "no-vig opener when proven"],
    notes: "Intelligence challenger. official=false. Cannot post Discord. V2 remains champion. EPA/CPOE stay missing.",
  },
  {
    modelName: "Model Yacht NFL GBT",
    modelVersion: "model-yacht-nfl-gbt-2026.09.2",
    sport: "nfl",
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "walk-forward gradient boosted trees (research)",
    features: ["same NFL contract as logreg; missing EPA/CPOE stay missing"],
    notes: "Intelligence challenger. Shadow only. Never auto-promoted.",
  },
  {
    modelName: "Model Yacht NFL market",
    modelVersion: "model-yacht-nfl-market-2026.09.2",
    sport: "nfl",
    status: "shadow" as const,
    role: "challenger" as const,
    trainingPeriod: "sportsbook no-vig baseline",
    features: ["proven two-way no-vig only"],
    notes: "Market baseline candidate. Close is evaluation-only.",
  },
];

export function isYachtModel(version: string | null | undefined): boolean {
  if (!version) return false;
  const v = version.trim().toLowerCase();
  return v === "model-yacht" || v.startsWith("model-yacht-");
}

export function isProductionModel(version: string | null | undefined): boolean {
  return Boolean(version && version.startsWith("v2-"));
}

export function isShadowModel(version: string | null | undefined): boolean {
  return Boolean(version && (version.startsWith("v3-") || version.startsWith("v4-") || isYachtModel(version)));
}

/**
 * Hard isolation: only V2 may queue or freeze an official Discord pick.
 * Registry promotion never overrides this. A future live-unlock must change this function
 * AND the explicit isolation test together.
 */
export function canQueueOfficial(version: string | null | undefined): boolean {
  return isProductionModel(version);
}

export function challengerVersion(sport: string, family: "v3" | "v4"): string {
  return family === "v3" ? `v3-${sport}-logreg` : `v4-${sport}-ensemble`;
}

export function catalogCard(entry: RegistryEntry, extra: Partial<ModelCard> = {}): ModelCard {
  return {
    modelName: extra.modelName ?? entry.modelName,
    modelVersion: extra.modelVersion ?? entry.modelVersion,
    sport: extra.sport ?? entry.sport,
    status: extra.status ?? entry.status,
    role: extra.role ?? entry.role,
    trainingPeriod: extra.trainingPeriod ?? entry.trainingPeriod,
    features: extra.features ?? entry.features,
    sampleSize: extra.sampleSize ?? null,
    brier: extra.brier ?? null,
    logLoss: extra.logLoss ?? null,
    accuracy: extra.accuracy ?? null,
    roi: extra.roi ?? null,
    clv: extra.clv ?? null,
    averageEdge: extra.averageEdge ?? null,
    betCount: extra.betCount ?? null,
    lastPredictionAt: extra.lastPredictionAt ?? null,
    eligible: extra.eligible ?? false,
    eligibleReasons: extra.eligibleReasons ?? ["Not enough forward sample."],
    livePosting: extra.livePosting ?? canQueueOfficial(entry.modelVersion),
    wins: extra.wins ?? null,
    losses: extra.losses ?? null,
    units: extra.units ?? null,
    drift: extra.drift ?? null,
  };
}
