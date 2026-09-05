/** Production BoatBoyz always uses V2. V3 is shadow/research only. */
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

export function isProductionModel(version: string | null | undefined): boolean {
  return Boolean(version && version.startsWith("v2-"));
}

export function canQueueOfficial(version: string | null | undefined): boolean {
  return isProductionModel(version);
}

export function isShadowModel(version: string | null | undefined): boolean {
  return Boolean(version && version.startsWith("v3-"));
}
