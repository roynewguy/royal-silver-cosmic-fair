import { featureKeyIsCloseOrResult, type YachtFeature } from "../../../core/provenance.ts";
import { marketBaseline, type MarketBaseline } from "../../market.ts";
import type { YachtMarketSnapshot } from "../../../core/provenance.ts";

export const MLB_VECTOR_KEYS = [
  "bias",
  "home_win_pct",
  "away_win_pct",
  "home_last5",
  "away_last5",
  "home_last10",
  "away_last10",
  "home_rdiff_pg",
  "away_rdiff_pg",
  "home_score_diff_pg",
  "away_score_diff_pg",
  "home_rest_days",
  "away_rest_days",
  "home_era",
  "away_era",
  "starter_era_home",
  "starter_era_away",
  "home_whip",
  "away_whip",
  "injury_away_minus_home",
  "open_no_vig_home",
  "era_missing",
  "starter_missing",
] as const;

export type MlbVector = {
  values: number[];
  names: string[];
  missingCritical: string[];
  dataQuality: number;
  uncertainty: number;
};

function num(features: YachtFeature[], key: string): number | null {
  const f = features.find((x) => x.key === key);
  if (!f?.usable) return null;
  if (typeof f.value !== "number" || !Number.isFinite(f.value)) return null;
  return f.value;
}

const CRITICAL = ["home_win_pct", "away_win_pct", "open_no_vig_home"] as const;

/**
 * Numeric vector from proven Yacht features only.
 * Close/result keys are rejected. Missing advanced stats are omitted, not invented.
 */
export function mlbFeatureVector(
  features: YachtFeature[],
  market: YachtMarketSnapshot,
  predictionAt: string,
): MlbVector {
  for (const f of features) {
    if (featureKeyIsCloseOrResult(f.key)) throw new Error(`leak: ${f.key} cannot enter the MLB vector`);
  }
  const byKey = new Map(MLB_VECTOR_KEYS.map((k) => [k, num(features, k)]));
  const eraHome = byKey.get("home_era") ?? byKey.get("starter_era_home");
  const eraAway = byKey.get("away_era") ?? byKey.get("starter_era_away");
  const eraMissing = eraHome == null || eraAway == null ? 1 : 0;
  const starterMissing = eraMissing;
  const baseline: MarketBaseline | null = marketBaseline(market, predictionAt);
  const openNoVig = byKey.get("open_no_vig_home") ?? (baseline && baseline.kind === "open" ? baseline.noVigHome : null);

  const missingCritical: string[] = [];
  for (const k of CRITICAL) {
    const v = k === "open_no_vig_home" ? openNoVig : byKey.get(k);
    if (v == null) missingCritical.push(k);
  }
  if (eraMissing) missingCritical.push("starting_pitcher_era");

  const values = [
    1,
    byKey.get("home_win_pct") ?? 0.5,
    byKey.get("away_win_pct") ?? 0.5,
    byKey.get("home_last5") ?? 0.5,
    byKey.get("away_last5") ?? 0.5,
    byKey.get("home_last10") ?? 0.5,
    byKey.get("away_last10") ?? 0.5,
    byKey.get("home_rdiff_pg") ?? byKey.get("home_score_diff_pg") ?? 0,
    byKey.get("away_rdiff_pg") ?? byKey.get("away_score_diff_pg") ?? 0,
    byKey.get("home_rest_days") ?? 3,
    byKey.get("away_rest_days") ?? 3,
    eraMissing ? 0 : (eraHome as number) - (eraAway as number),
    byKey.get("home_whip") != null && byKey.get("away_whip") != null
      ? (byKey.get("home_whip") as number) - (byKey.get("away_whip") as number)
      : 0,
    byKey.get("injury_away_minus_home") ?? 0,
    openNoVig ?? 0.5,
    eraMissing,
    starterMissing,
  ];

  const usable = features.filter((f) => f.usable).length;
  const coverage = usable / Math.max(features.length, 1);
  let dataQuality = coverage;
  if (eraMissing) dataQuality *= 0.72;
  if (openNoVig == null) dataQuality *= 0.55;
  if (byKey.get("home_win_pct") == null || byKey.get("away_win_pct") == null) dataQuality *= 0.7;
  dataQuality = Math.max(0, Math.min(1, dataQuality));

  const uncertainty = Math.max(0, Math.min(1, 0.18 + (1 - dataQuality) * 0.55 + missingCritical.length * 0.05));

  return {
    values,
    names: [
      "bias",
      "home_win_pct",
      "away_win_pct",
      "home_last5",
      "away_last5",
      "home_last10",
      "away_last10",
      "rdiff_home",
      "rdiff_away",
      "rest_home",
      "rest_away",
      "era_diff",
      "whip_diff",
      "injury_away_minus_home",
      "open_no_vig_home",
      "era_missing",
      "starter_missing",
    ],
    missingCritical,
    dataQuality,
    uncertainty,
  };
}
