import { canQueueOfficial } from "../models-v3/registry.ts";
import { marketAgeMs } from "./data-quality.ts";
import { twoWayMarket } from "./odds.ts";
import type { GameCard } from "./types.ts";
import {
  evaluateBetOpportunity,
  officialQuoteFields,
  uncertaintyFromQuality,
  type BetDecision,
} from "./value.ts";

export function betScore(decision: BetDecision, modelReliability = 1): number {
  if (decision.action !== "BET") return 0;
  const reliability = Math.max(0.2, Math.min(1.2, modelReliability));
  const quality = decision.dataQuality / 100;
  const confAdj = decision.confidence / 100;
  const uncertaintyAdj = 1 - decision.uncertainty;
  return decision.expectedValuePct * reliability * quality * confAdj * uncertaintyAdj;
}

export function sameTeam(a: GameCard, b: GameCard): boolean {
  if (a.id === b.id) return true;
  if (a.league !== b.league) return false;
  const teams = new Set([a.home.abbr, a.away.abbr]);
  return teams.has(b.home.abbr) || teams.has(b.away.abbr);
}

/** Drop later correlated games. First in the ranked list wins. */
export function dropCorrelated(ranked: GameCard[]): { keep: GameCard[]; dropped: GameCard[] } {
  const keep: GameCard[] = [];
  const dropped: GameCard[] = [];
  for (const game of ranked) {
    if (keep.some((k) => sameTeam(k, game))) dropped.push(game);
    else keep.push(game);
  }
  return { keep, dropped };
}

/**
 * Official edge is vs a two-way no-vig market.
 * One price is not a market — missing the other side is PASS_MARKET_INCOMPLETE, not raw implied.
 * Prefer the rank's stored no-vig (already de-vigged from both sides) so edge stays consistent
 * with V2; only recompute when the stored value is missing.
 */
export function officialNoVigProbability(game: GameCard): number | null {
  const rank = game.rank;
  if (!rank) return null;
  const odds = game.odds;
  let computed: number | null = null;
  if (rank.market === "moneyline") {
    if (odds.homeMl == null || odds.awayMl == null) return null;
    const mkt = twoWayMarket(odds.homeMl, odds.awayMl);
    computed = rank.side === "away" ? mkt.noVigB : mkt.noVigA;
  } else if (rank.market === "spread") {
    if (odds.homeSpreadOdds == null || odds.awaySpreadOdds == null) return null;
    const mkt = twoWayMarket(odds.homeSpreadOdds, odds.awaySpreadOdds);
    computed = rank.side === "away" ? mkt.noVigB : mkt.noVigA;
  } else if (rank.market === "total") {
    if (odds.overOdds == null || odds.underOdds == null) return null;
    const mkt = twoWayMarket(odds.overOdds, odds.underOdds);
    computed = rank.side === "under" ? mkt.noVigB : mkt.noVigA;
  } else {
    return null;
  }
  return rank.noVigImplied ?? computed;
}

export function officialDecision(game: GameCard, minEdge: number, minConf: number): BetDecision {
  const rank = game.rank;
  if (!rank) {
    return {
      action: "PASS",
      edgePct: 0,
      expectedValuePct: 0,
      confidence: 0,
      uncertainty: 1,
      dataQuality: 0,
      reason: "PASS_NO_EDGE",
      detail: "No V2 rank.",
    };
  }
  if (!canQueueOfficial(rank.model)) {
    return {
      action: "PASS",
      edgePct: rank.edgePct,
      expectedValuePct: 0,
      confidence: rank.confidence,
      uncertainty: 1,
      dataQuality: rank.dataQuality ?? 0,
      reason: "PASS_CRITICAL_DATA_MISSING",
      detail: `${rank.model} is not the live champion.`,
    };
  }
  const marketProbability = officialNoVigProbability(game);
  if (marketProbability == null) {
    return {
      action: "PASS",
      edgePct: rank.edgePct,
      expectedValuePct: 0,
      confidence: rank.confidence,
      uncertainty: 1,
      dataQuality: rank.dataQuality ?? 0,
      reason: "PASS_MARKET_INCOMPLETE",
      detail: "Both sides of the no-vig market are required. No raw-implied fallback.",
    };
  }
  const quote = officialQuoteFields(game, rank.market, rank.side);
  const v3 = game.shadows?.v3?.probability ?? null;
  const disagreement = v3 != null ? Math.abs(rank.probability - v3) : 0;
  return evaluateBetOpportunity({
    modelProbability: rank.probability,
    marketProbability,
    price: rank.price,
    opposingPrice: quote.opposingPrice,
    sportsbook: quote.sportsbook,
    capturedAt: quote.capturedAt,
    line: rank.line,
    dataQuality: rank.dataQuality ?? 0,
    modelUncertainty: uncertaintyFromQuality({
      dataQuality: rank.dataQuality ?? 0,
      missingCount: rank.missingInputs?.length ?? 0,
      marketAgeMs: marketAgeMs(game),
      modelDisagreement: disagreement,
    }),
    marketAgeMs: marketAgeMs(game),
    sport: game.league,
    marketType: rank.market,
    minEdgePct: minEdge,
    minConfidence: minConf,
    confidence: rank.confidence,
    passReason: rank.passReason ?? null,
    consensusProb: game.shadows?.consensus?.noVigHome ?? null,
    consensusDispersion: game.shadows?.consensus?.dispersion ?? null,
    openPrice: game.odds.openHomeMl,
    modelVersion: rank.model,
  });
}

export function qualifyOfficial(game: GameCard, minEdge: number, minConf: number): boolean {
  return officialDecision(game, minEdge, minConf).action === "BET";
}

/** Rank playable games by quality score, not raw edge. */
export function rankByBetScore(games: GameCard[], minEdge: number, minConf: number): GameCard[] {
  return games
    .map((g) => ({ g, score: betScore(officialDecision(g, minEdge, minConf)) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.g);
}
