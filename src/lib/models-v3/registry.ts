/** Production BoatBoyz always uses V2. V3 is shadow/research only. */
export const PRODUCTION_MODELS = {
  mlb: "v2-mlb",
  nba: "v2-nba",
  nfl: "v2-nfl",
  nhl: "v2-nhl",
} as const;

export function isProductionModel(version: string | null | undefined): boolean {
  return Boolean(version && version.startsWith("v2-"));
}

export function canQueueOfficial(version: string | null | undefined): boolean {
  return isProductionModel(version);
}

export function isShadowModel(version: string | null | undefined): boolean {
  return Boolean(version && version.startsWith("v3-"));
}
