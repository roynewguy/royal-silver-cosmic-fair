import { twoWayMarket, clamp } from "../sports/odds.ts";
import { dataQualityFor, marketAgeMs } from "../sports/data-quality.ts";
import { evaluateBetOpportunity, expectedValuePct, uncertaintyFromQuality } from "../sports/value.ts";
import { canQueueOfficial, challengerVersion } from "./registry.ts";
import { applySportAdjust } from "./sport-adjust.ts";
import { mlbShadowFeatures } from "./mlb-shadow-features.ts";
import type { GameCard, ModelCall } from "../sports/types.ts";
import type { ShadowCall } from "./shadow.ts";

export const V4_WEIGHTS = { v2: 0.35, v3: 0.35, market: 0.3 } as const;
export const V4_NO_V3 = { v2: 0.55, market: 0.45 } as const;

/** Shadow ensemble: hardcoded 35/35/30 mix of V2 + V3 + no-vig market. Weights are not learned. Never official. Does not use closing prices as inputs. */
export function blendV4(opts: { v2: number; v3: number | null; market: number | null }): number {
  const v2 = clamp(opts.v2, 0.05, 0.95);
  if (opts.v3 == null || opts.market == null) {
    if (opts.market == null) return v2;
    return clamp(V4_NO_V3.v2 * v2 + V4_NO_V3.market * opts.market, 0.05, 0.95);
  }
  const v3 = clamp(opts.v3, 0.05, 0.95);
  const market = clamp(opts.market, 0.05, 0.95);
  return clamp(V4_WEIGHTS.v2 * v2 + V4_WEIGHTS.v3 * v3 + V4_WEIGHTS.market * market, 0.05, 0.95);
}

export function v4Predict(
  game: GameCard,
  v2HomeProb: number | null,
  v3: ShadowCall | null,
  now = Date.now(),
): ModelCall | null {
  if (v2HomeProb == null || !Number.isFinite(v2HomeProb)) return null;
  if (game.odds.homeMl == null || game.odds.awayMl == null) return null;
  const mkt = twoWayMarket(game.odds.homeMl, game.odds.awayMl);
  const blended = blendV4({ v2: v2HomeProb, v3: v3?.probability ?? null, market: mkt.noVigA });
  const adjusted = applySportAdjust(blended, mkt.noVigA, game);
  const pHome = adjusted.probability;
  const edgeHome = pHome - mkt.noVigA;
  const edgeAway = 1 - pHome - mkt.noVigB;
  const pickHome = edgeHome >= edgeAway;
  const probability = pickHome ? pHome : 1 - pHome;
  const price = pickHome ? game.odds.homeMl : game.odds.awayMl;
  const marketProbability = pickHome ? mkt.noVigA : mkt.noVigB;
  const quality = dataQualityFor(game, now);
  const disagreement = v3 ? Math.abs(v2HomeProb - v3.probability) : 0;
  const mlb = game.league === "mlb" ? mlbShadowFeatures(game) : null;
  const uncertainty = uncertaintyFromQuality({
    dataQuality: quality.score,
    missingCount: quality.missing.length,
    marketAgeMs: marketAgeMs(game, now),
    modelDisagreement: disagreement,
  });
  const decision = evaluateBetOpportunity({
    modelProbability: probability,
    marketProbability,
    price,
    opposingPrice: pickHome ? game.odds.awayMl : game.odds.homeMl,
    sportsbook: game.odds.book,
    capturedAt: game.odds.capturedAt,
    dataQuality: quality.score,
    modelUncertainty: Math.max(uncertainty, adjusted.adjust.shrink * 0.5, mlb?.uncertaintyBump ?? 0),
    marketAgeMs: marketAgeMs(game, now),
    sport: game.league,
    marketType: "moneyline",
    minEdgePct: 3,
    minConfidence: 58,
    confidence: Math.round(clamp(72 - uncertainty * 40, 20, 80)),
    openPrice: pickHome ? game.odds.openHomeMl : null,
    consensusProb: game.shadows?.consensus?.noVigHome ?? null,
    consensusDispersion: game.shadows?.consensus?.dispersion ?? null,
  });
  const model = challengerVersion(game.league, "v4");
  return {
    model,
    probability,
    marketProbability,
    edgePct: decision.edgePct,
    expectedValuePct: price != null ? expectedValuePct(probability, price) : null,
    uncertainty,
    dataQuality: quality.score,
    confidence: decision.confidence,
    action: decision.action,
    passReason: decision.reason === "BET" ? null : decision.reason,
    official: false,
    price,
    side: pickHome ? "home" : "away",
  };
}

export function assertV4NeverOfficial(call: ModelCall): void {
  if (call.official) throw new Error("V4 marked official");
  if (canQueueOfficial(call.model)) throw new Error("V4 must not be queueable as official");
}
