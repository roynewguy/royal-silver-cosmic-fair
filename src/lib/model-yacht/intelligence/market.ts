import { impliedFromAmerican, twoWayMarket } from "../../sports/odds.ts";
import { clvSelectedSide } from "../../models-v3/evaluate.ts";
import { featureKeyIsCloseOrResult, provenPregameTwoWay, type YachtMarketSnapshot } from "../core/provenance.ts";

export type MarketBaseline = {
  sportsbook: string;
  capturedAt: string;
  kind: "open" | "current";
  homePrice: number;
  awayPrice: number;
  noVigHome: number;
  noVigAway: number;
  hold: number;
  /** Closing prices are evaluation-only. Never features. */
  closeHome: number | null;
  closeAway: number | null;
};

/**
 * Two-sided no-vig market probability. One-sided quotes are not a market baseline.
 * Unproven timestamps are not a market baseline.
 */
export function marketBaseline(market: YachtMarketSnapshot, predictionAt: string): MarketBaseline | null {
  const pair = provenPregameTwoWay(market, predictionAt);
  if (!pair) return null;
  const mkt = twoWayMarket(pair.home, pair.away);
  return {
    sportsbook: market.sportsbook,
    capturedAt: pair.capturedAt,
    kind: pair.kind,
    homePrice: pair.home,
    awayPrice: pair.away,
    noVigHome: mkt.noVigA,
    noVigAway: mkt.noVigB,
    hold: mkt.hold,
    closeHome: market.homeClose,
    closeAway: market.awayClose,
  };
}

export function modelVsMarket(modelHome: number, baseline: MarketBaseline): number {
  return modelHome - baseline.noVigHome;
}

/** Close is evaluation-only. Never a prediction feature or stake. */
export function closingClv(input: {
  stakeHome: number;
  stakeAway: number;
  betHome: boolean;
  closeHome: number | null;
  closeAway: number | null;
}): number | null {
  const stake = input.betHome ? input.stakeHome : input.stakeAway;
  const close = input.betHome ? input.closeHome : input.closeAway;
  return clvSelectedSide(stake, close);
}

export function oneSidedIsNotNoVig(home: number | null, away: number | null): boolean {
  return home == null || away == null;
}

export function closeIsNotAFeature(featureKeys: string[]): boolean {
  return !featureKeys.some((k) => featureKeyIsCloseOrResult(k) || /(_close|closing_)/i.test(k));
}

export function rawImpliedIsNotNoVig(home: number, away: number): boolean {
  const raw = impliedFromAmerican(home) + impliedFromAmerican(away);
  return raw > 1 + 1e-9;
}
