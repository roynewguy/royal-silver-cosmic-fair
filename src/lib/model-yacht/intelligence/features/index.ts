import type { YachtSport } from "../../core/versioning.ts";
import { MLB_FEATURE_CONTRACT } from "./mlb.ts";
import { NFL_FEATURE_CONTRACT } from "./nfl.ts";
import { NCAAF_FEATURE_CONTRACT } from "./ncaaf.ts";
import { NBA_FEATURE_CONTRACT } from "./nba.ts";
import { WNBA_FEATURE_CONTRACT } from "./wnba.ts";
import { NHL_FEATURE_CONTRACT } from "./nhl.ts";
import { NCAAB_FEATURE_CONTRACT } from "./ncaab.ts";
import { UFC_FEATURE_CONTRACT } from "./ufc.ts";
import type { SportFeatureContract } from "./spec.ts";

export {
  MLB_FEATURE_CONTRACT,
  NFL_FEATURE_CONTRACT,
  NCAAF_FEATURE_CONTRACT,
  NBA_FEATURE_CONTRACT,
  WNBA_FEATURE_CONTRACT,
  NHL_FEATURE_CONTRACT,
  NCAAB_FEATURE_CONTRACT,
  UFC_FEATURE_CONTRACT,
};
export { missingKeys, usableFeatureKeys, type FeatureSpec, type SportFeatureContract } from "./spec.ts";

const CONTRACTS: Record<YachtSport, SportFeatureContract> = {
  mlb: MLB_FEATURE_CONTRACT,
  nfl: NFL_FEATURE_CONTRACT,
  ncaaf: NCAAF_FEATURE_CONTRACT,
  nba: NBA_FEATURE_CONTRACT,
  wnba: WNBA_FEATURE_CONTRACT,
  nhl: NHL_FEATURE_CONTRACT,
  ncaab: NCAAB_FEATURE_CONTRACT,
  ufc: UFC_FEATURE_CONTRACT,
};

export function featureContract(sport: YachtSport): SportFeatureContract {
  return CONTRACTS[sport];
}

export function allFeatureContracts(): SportFeatureContract[] {
  return Object.values(CONTRACTS);
}
