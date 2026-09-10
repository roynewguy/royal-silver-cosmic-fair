import { featureKeyIsCloseOrResult, type YachtFeature } from "../../../core/provenance.ts";
import { marketBaseline, type MarketBaseline } from "../../market.ts";
import type { YachtMarketSnapshot } from "../../../core/provenance.ts";
import { byeWeek, isThursdayKickoff, shortWeek } from "./situational.ts";

export const NFL_FEATURE_SCHEMA_VERSION = "yacht-nfl-1";

export const NFL_VECTOR_KEYS = [
  "bias",
  "home_win_pct",
  "away_win_pct",
  "home_last5",
  "away_last5",
  "home_last10",
  "away_last10",
  "home_point_diff_pg",
  "away_point_diff_pg",
  "home_rest_days",
  "away_rest_days",
  "rest_diff",
  "short_week_home",
  "short_week_away",
  "bye_week_home",
  "bye_week_away",
  "thursday",
  "home_field",
  "injury_away_minus_home",
  "qb_out_home",
  "qb_out_away",
  "qb_doubt_home",
  "qb_doubt_away",
  "ol_injury_delta",
  "skill_injury_delta",
  "def_injury_delta",
  "wind_mph",
  "precip",
  "cold",
  "dome",
  "open_no_vig_home",
  "line_move_home",
  "spread_home",
  "total",
  "epa_missing",
  "qb_epa_missing",
] as const;

export type NflVector = {
  values: number[];
  names: string[];
  missingCritical: string[];
  dataQuality: number;
  uncertainty: number;
  schemaVersion: typeof NFL_FEATURE_SCHEMA_VERSION;
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
 * Close/result keys are rejected. EPA/CPOE stay missing flags, never invented.
 */
export function nflFeatureVector(
  features: YachtFeature[],
  market: YachtMarketSnapshot,
  predictionAt: string,
  startAt: string,
): NflVector {
  for (const f of features) {
    if (featureKeyIsCloseOrResult(f.key) || /(_close|closing_)/i.test(f.key)) {
      throw new Error(`leak: ${f.key} cannot enter the NFL vector`);
    }
  }
  const byKey = new Map(features.map((f) => [f.key, f.usable && typeof f.value === "number" ? f.value : null]));
  const get = (k: string) => num(features, k) ?? (typeof byKey.get(k) === "number" ? (byKey.get(k) as number) : null);

  const baseline: MarketBaseline | null = marketBaseline(market, predictionAt);
  const openNoVig = get("open_no_vig_home") ?? (baseline && baseline.kind === "open" ? baseline.noVigHome : null);
  const currentNoVig = get("current_no_vig_home") ?? (baseline && baseline.kind === "current" ? baseline.noVigHome : null);
  const lineMove =
    openNoVig != null && currentNoVig != null ? currentNoVig - openNoVig : get("line_move_home");

  const restHome = get("home_rest_days");
  const restAway = get("away_rest_days");
  const qbOutHome = get("qb_out_home");
  const qbOutAway = get("qb_out_away");
  const qbUnconfirmed = (qbOutHome ?? 0) + (qbOutAway ?? 0) + (get("qb_doubt_home") ?? 0) + (get("qb_doubt_away") ?? 0) > 0;

  const missingCritical: string[] = [];
  for (const k of CRITICAL) {
    const v = k === "open_no_vig_home" ? openNoVig : get(k);
    if (v == null) missingCritical.push(k);
  }
  if (qbOutHome == null && qbOutAway == null) missingCritical.push("qb_status");

  const values = [
    1,
    get("home_win_pct") ?? 0.5,
    get("away_win_pct") ?? 0.5,
    get("home_last5") ?? 0.5,
    get("away_last5") ?? 0.5,
    get("home_last10") ?? 0.5,
    get("away_last10") ?? 0.5,
    get("home_point_diff_pg") ?? get("home_score_diff_pg") ?? 0,
    get("away_point_diff_pg") ?? get("away_score_diff_pg") ?? 0,
    restHome ?? 7,
    restAway ?? 7,
    (restHome ?? 7) - (restAway ?? 7),
    shortWeek(restHome) ?? 0,
    shortWeek(restAway) ?? 0,
    byeWeek(restHome) ?? 0,
    byeWeek(restAway) ?? 0,
    isThursdayKickoff(startAt) ? 1 : 0,
    1,
    get("injury_away_minus_home") ?? 0,
    qbOutHome ?? 0,
    qbOutAway ?? 0,
    get("qb_doubt_home") ?? 0,
    get("qb_doubt_away") ?? 0,
    get("ol_injury_delta") ?? 0,
    get("skill_injury_delta") ?? 0,
    get("def_injury_delta") ?? 0,
    get("wind_mph") ?? 0,
    get("precip") ?? 0,
    get("temperature") != null && (get("temperature") as number) <= 32 ? 1 : 0,
    get("dome") ?? 0,
    openNoVig ?? 0.5,
    lineMove ?? 0,
    get("spread_home") ?? 0,
    get("total") ?? 0,
    1, // epa_missing — nflfastR not present
    1, // qb_epa_missing
  ];

  if (values.length !== NFL_VECTOR_KEYS.length) {
    throw new Error("NFL vector length mismatch");
  }

  const usable = features.filter((f) => f.usable).length;
  const coverage = usable / Math.max(features.length, 1);
  let dataQuality = coverage;
  if (openNoVig == null) dataQuality *= 0.55;
  if (get("home_win_pct") == null || get("away_win_pct") == null) dataQuality *= 0.7;
  if (qbOutHome == null && qbOutAway == null) dataQuality *= 0.82;
  if (qbUnconfirmed) dataQuality *= 0.88;
  dataQuality *= 0.72; // EPA/CPOE/pace still missing — honest quality haircut
  dataQuality = Math.max(0, Math.min(1, dataQuality));

  const uncertainty = Math.max(
    0,
    Math.min(1, 0.2 + (1 - dataQuality) * 0.55 + missingCritical.length * 0.05 + (qbUnconfirmed ? 0.08 : 0)),
  );

  return {
    values,
    names: [...NFL_VECTOR_KEYS],
    missingCritical,
    dataQuality,
    uncertainty,
    schemaVersion: NFL_FEATURE_SCHEMA_VERSION,
  };
}
