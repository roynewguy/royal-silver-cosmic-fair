/** Public name. Never V5/V6/V7. One brand; independent engines per sport later. */
export const MODEL_YACHT_PUBLIC_NAME = "Model Yacht";

export const MODEL_YACHT_STATUS = "candidate" as const;
export const MODEL_YACHT_ROLE = "shadow" as const;

export const YACHT_CONTRACT_STAMP = "2026.09.1";

/** Sports the chassis accepts. Independent models — not one universal brain. */
export const YACHT_SPORTS = ["mlb", "nfl", "ncaaf", "nba", "wnba", "nhl", "ncaab", "ufc"] as const;
export type YachtSport = (typeof YACHT_SPORTS)[number];

export function isYachtSport(id: string | null | undefined): id is YachtSport {
  return Boolean(id && (YACHT_SPORTS as readonly string[]).includes(id));
}

/** Sport-neutral version string. Do not hardcode a league into core callers. */
export function yachtVersion(sport: string, stamp = YACHT_CONTRACT_STAMP): string {
  const id = sport.trim().toLowerCase();
  if (!id) throw new Error("yachtVersion requires a sport");
  return `model-yacht-${id}-${stamp}`;
}

export function isYachtVersion(version: string | null | undefined): boolean {
  if (!version) return false;
  const v = version.trim().toLowerCase();
  return v === "model-yacht" || v.startsWith("model-yacht-");
}

export function sportFromYachtVersion(version: string | null | undefined): string | null {
  if (!version) return null;
  const m = /^model-yacht-([a-z0-9]+)-/i.exec(version.trim());
  return m?.[1]?.toLowerCase() ?? null;
}

export function yachtVersionMatchesSport(version: string, sport: string): boolean {
  return sportFromYachtVersion(version) === sport.trim().toLowerCase();
}
