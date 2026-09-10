export {
  MODEL_YACHT_PUBLIC_NAME,
  MODEL_YACHT_STATUS,
  MODEL_YACHT_ROLE,
  YACHT_CONTRACT_STAMP,
  YACHT_SPORTS,
  yachtVersion,
  isYachtVersion,
  isYachtSport,
  sportFromYachtVersion,
} from "./core/versioning.ts";

export { MODEL_YACHT_MLB_CONTRACT } from "./sports/mlb/names.ts";

/** @deprecated MLB-only prefix. Use yachtVersion(sport). */
export const MODEL_YACHT_CANDIDATE_PREFIX = "model-yacht-mlb-";
