import { twoWayMarket } from "../sports/odds.ts";
import {
  clvSelectedSide,
  honestBacktest,
  pregameStakePrice,
  sideEvalFromMarket,
  type SideEval,
} from "../models-v3/evaluate.ts";
import { twoWayPregame, type YachtMarketSnapshot } from "./provenance.ts";

export { pregameStakePrice, clvSelectedSide, honestBacktest, sideEvalFromMarket };

export type YachtBetEval = {
  p: number;
  y: 0 | 1;
  market: YachtMarketSnapshot;
};

function profit(american: number, won: boolean): number {
  if (!won) return -1;
  if (american < 0) return 100 / Math.abs(american);
  return american / 100;
}

/**
 * Model Yacht ROI. Stake is a proven two-sided pregame quote (open, else current-at-prediction).
 * Close is CLV-only. Missing pregame two-way → drop. Never invent.
 */
export function yachtRoi(
  rows: YachtBetEval[],
  minEdge: number,
): { n: number; units: number; roi: number | null; avgClv: number | null; dropped: number } {
  let n = 0;
  let units = 0;
  let dropped = 0;
  const clvs: number[] = [];
  for (const r of rows) {
    const pair = twoWayPregame(r.market);
    const homeStake = pair ? pregameStakePrice(pair.home, r.market.homeClose) : null;
    const awayStake = pair ? pregameStakePrice(pair.away, r.market.awayClose) : null;
    if (pair == null || homeStake == null || awayStake == null) {
      dropped += 1;
      continue;
    }
    const mkt = twoWayMarket(homeStake, awayStake);
    const edgeHome = r.p - mkt.noVigA;
    const edgeAway = 1 - r.p - mkt.noVigB;
    const betHome = edgeHome >= edgeAway;
    const edge = betHome ? edgeHome : edgeAway;
    if (edge < minEdge) continue;
    const price = betHome ? homeStake : awayStake;
    n += 1;
    units += profit(price, betHome ? r.y === 1 : r.y === 0);
    const close = betHome ? r.market.homeClose : r.market.awayClose;
    const clv = clvSelectedSide(price, close);
    if (clv != null) clvs.push(clv);
  }
  return {
    n,
    units,
    roi: n ? units / n : null,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
    dropped,
  };
}

export function yachtSideEval(p: number, y: 0 | 1, market: YachtMarketSnapshot): SideEval {
  return sideEvalFromMarket(p, y, {
    homeOpen: market.homeOpen,
    awayOpen: market.awayOpen,
    homeClose: market.homeClose,
    awayClose: market.awayClose,
  });
}
