import { clamp, impliedFromAmerican, parseWinPct } from "./odds.ts";
import { isDraftKingsLine } from "./odds-api.ts";
import { featureFreshness, shouldFlagEdgeOutlier } from "./validation.ts";
import type { GameCard, PassReason, RankPick } from "./types.ts";

export const STALE_MARKET_MS = 20 * 60_000;
export const STARTER_WINDOW_MS = 180 * 60_000;
export const LOW_DATA_QUALITY = 60;
const MIN_CONF = 58;
const MIN_EDGE_PCT = 3;

export function shouldAppendSnapshot(lastAt: number | null, lastP: number | null, now: number, p: number): boolean {
  if (lastAt == null) return true;
  if (now - lastAt >= 25 * 60_000) return true;
  return Math.abs((lastP ?? p) - p) >= 0.005;
}

export function marketAgeMs(game: GameCard, now = Date.now()): number | null {
  if (!game.odds.capturedAt) return null;
  const t = new Date(game.odds.capturedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

export function mlbDataQuality(game: GameCard, now = Date.now()): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];
  if (parseWinPct(game.home.record) != null && parseWinPct(game.away.record) != null) score += 15;
  else missing.push("team records");

  if (game.home.starter?.name && game.away.starter?.name) score += 20;
  else missing.push("probable starters");

  if (game.home.starter?.era != null && game.away.starter?.era != null) score += 20;
  else missing.push("starter ERA");

  if (Array.isArray(game.injuries)) score += 15;
  else missing.push("injuries");

  const age = marketAgeMs(game, now);
  if (isDraftKingsLine(game.odds) && (age == null || age <= STALE_MARKET_MS)) score += 20;
  else if (game.odds.homeMl != null && game.odds.awayMl != null) {
    score += 10;
    missing.push("market freshness");
  } else missing.push("two-way market");

  if (game.weather) score += 10;
  else missing.push("weather");

  if (!game.home.homeSplit && !game.away.roadSplit) missing.push("home/road splits");
  missing.push("bullpen workload");
  return { score: clamp(score, 0, 100), missing };
}

export function genericDataQuality(game: GameCard, now = Date.now()): { score: number; missing: string[] } {
  let score = 40;
  const missing: string[] = [];
  if (parseWinPct(game.home.record) != null && parseWinPct(game.away.record) != null) score += 15;
  else missing.push("team records");
  if (Array.isArray(game.injuries)) score += 15;
  else missing.push("injuries");
  const age = marketAgeMs(game, now);
  if (isDraftKingsLine(game.odds) && (age == null || age <= STALE_MARKET_MS)) score += 20;
  else if (game.odds.homeMl != null || game.odds.homeSpread != null) {
    score += 10;
    missing.push("market freshness");
  } else missing.push("market");
  if (game.weather) score += 10;
  return { score: clamp(score, 0, 100), missing };
}

export function dataQualityFor(game: GameCard, now = Date.now()) {
  return game.league === "mlb" ? mlbDataQuality(game, now) : genericDataQuality(game, now);
}

export function confidenceFrom(opts: {
  probability: number;
  edgePct: number;
  dataQuality: number;
  missing: string[];
}): number {
  const edgeBoost = clamp(opts.edgePct, 0, 10) * 1.1;
  let c = 28 + opts.dataQuality * 0.48 + edgeBoost;
  if (opts.missing.includes("probable starters") || opts.missing.includes("starter ERA")) c -= 6;
  if (opts.dataQuality < LOW_DATA_QUALITY) c = Math.min(c, MIN_CONF - 1);
  c = clamp(c, 20, 85);
  const asPct = Math.round(opts.probability * 100);
  if (Math.round(c) === asPct) c = clamp(c - 3, 20, 85);
  return Math.round(c);
}

export function isPlayableRank(
  rank: { edgePct: number; confidence?: number; passReason?: string | null } | null | undefined,
  minEdge = MIN_EDGE_PCT,
  minConf = MIN_CONF,
): boolean {
  if (!rank) return false;
  if (rank.passReason) return false;
  if ((rank.confidence ?? minConf) < minConf) return false;
  return rank.edgePct >= minEdge;
}

export function guardrailReason(
  game: GameCard,
  pick: RankPick,
  quality: { score: number; missing: string[] },
  now = Date.now(),
): PassReason | null {
  const start = new Date(game.startAt).getTime();
  const near = Number.isFinite(start) && start - now <= STARTER_WINDOW_MS && start > now;
  const bothStartersMissing = !game.home.starter?.name && !game.away.starter?.name;
  if (game.league === "mlb" && near && bothStartersMissing) return "PASS_MISSING_STARTER";
  const age = marketAgeMs(game, now);
  if (isDraftKingsLine(game.odds) && age != null && age > STALE_MARKET_MS) return "PASS_STALE_MARKET";
  if (quality.score < LOW_DATA_QUALITY) return "PASS_LOW_DATA_QUALITY";
  if (pick.edgePct < MIN_EDGE_PCT) return "PASS_EDGE_TOO_SMALL";
  if (pick.confidence < MIN_CONF) return "PASS_LOW_CONFIDENCE";
  return null;
}

export function sealRank(game: GameCard, pick: RankPick | null, now = Date.now()): RankPick | null {
  if (!pick) return null;
  const quality = dataQualityFor(game, now);
  const rawImplied = pick.rawImplied ?? impliedFromAmerican(pick.price);
  const noVigImplied = pick.noVigImplied ?? null;
  const vigAdjusted = pick.vigAdjusted === true;
  const hold = pick.marketHold ?? null;
  if (noVigImplied != null) {
    pick = { ...pick, edgePct: (pick.probability - noVigImplied) * 100 };
  }
  const confidence = confidenceFrom({
    probability: pick.probability,
    edgePct: pick.edgePct,
    dataQuality: quality.score,
    missing: quality.missing,
  });
  const next: RankPick = {
    ...pick,
    confidence,
    rawImplied,
    noVigImplied,
    marketHold: hold,
    vigAdjusted,
    dataQuality: quality.score,
    missingInputs: quality.missing,
  };
  next.passReason = guardrailReason(game, next, quality, now);
  next.freshness = featureFreshness(game, now);
  next.flags = shouldFlagEdgeOutlier(game, next.edgePct) ? ["EDGE_OUTLIER"] : [];
  next.outlierReason = next.flags.includes("EDGE_OUTLIER") ? "EDGE_OUTLIER" : null;
  return next;
}
