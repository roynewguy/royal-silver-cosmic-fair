/** Public name. Never V5/V6/V7. */
export const MODEL_YACHT_PUBLIC_NAME = "Model Yacht";

/** Internal candidate family. Date stamp is the dataset/contract version, not a live switch. */
export const MODEL_YACHT_CANDIDATE_PREFIX = "model-yacht-mlb-";

export const MODEL_YACHT_MLB_CONTRACT = "model-yacht-mlb-2026.09.1";

export const MODEL_YACHT_STATUS = "candidate" as const;
export const MODEL_YACHT_ROLE = "shadow" as const;

export function yachtVersion(dateStamp = "2026.09.1"): string {
  return `${MODEL_YACHT_CANDIDATE_PREFIX}${dateStamp}`;
}

export function isYachtVersion(version: string | null | undefined): boolean {
  if (!version) return false;
  const v = version.trim().toLowerCase();
  return v === "model-yacht" || v.startsWith("model-yacht-");
}
