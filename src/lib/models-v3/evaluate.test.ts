import assert from "node:assert/strict";
import { test } from "node:test";
import { impliedFromAmerican, twoWayMarket } from "../sports/odds.ts";
import {
  backtestSides,
  clvSelectedSide,
  honestBacktest,
  pregameStakePrice,
  sideEvalFromMarket,
} from "./evaluate.ts";
import * as evaluateMod from "./evaluate.ts";

test("legacy one-sided backtest helper is gone", () => {
  assert.equal("backtest" in evaluateMod, false);
});

test("home bet uses home price and away bet uses away price", () => {
  const homeFav = sideEvalFromMarket(0.72, 1, { homeOpen: -180, awayOpen: 155, homeClose: -200, awayClose: 170 });
  const homeBt = backtestSides([homeFav], 0.01);
  assert.equal(homeBt.n, 1);
  assert.ok(Math.abs(homeBt.units - 100 / 180) < 1e-9);

  const awayDog = sideEvalFromMarket(0.38, 0, { homeOpen: -180, awayOpen: 155, homeClose: -200, awayClose: 170 });
  const awayBt = backtestSides([awayDog], 0.01);
  assert.equal(awayBt.n, 1);
  assert.ok(Math.abs(awayBt.units - 1.55) < 1e-9);
});

test("missing away price cannot create an away backtest bet", () => {
  const row = sideEvalFromMarket(0.4, 0, { homeOpen: -150, awayOpen: null, homeClose: -160, awayClose: 140 });
  assert.equal(row.awayPrice, null);
  assert.equal(backtestSides([row], 0.01).n, 0);
  assert.equal(honestBacktest([row], 0.01).n, 0);
});

test("closing price cannot become stake price", () => {
  assert.equal(pregameStakePrice(null, -200), null);
  assert.equal(pregameStakePrice(-110, -200), -110);
  const onlyClose = sideEvalFromMarket(0.6, 1, { homeOpen: null, awayOpen: null, homeClose: -200, awayClose: 170 });
  assert.equal(onlyClose.homePrice, null);
  assert.equal(onlyClose.stakePrice, null);
  assert.equal(backtestSides([onlyClose], 0).n, 0);
  assert.equal(honestBacktest([onlyClose], 0).n, 0);
});

test("CLV uses the actual selected side", () => {
  // Posted -150, close -170: market moved toward home. Positive CLV on the home stake.
  const homeClv = clvSelectedSide(-150, -170);
  // Posted +130, close +145: dog got longer. Negative CLV on the away stake.
  const awayClv = clvSelectedSide(130, 145);
  assert.ok(homeClv != null && homeClv > 0);
  assert.ok(awayClv != null && awayClv < 0);
  assert.notEqual(homeClv, awayClv);
  assert.equal(clvSelectedSide(-150, null), null);
});

test("two-sided market is de-vigged correctly", () => {
  const even = twoWayMarket(-110, -110);
  assert.ok(Math.abs(even.noVigA - 0.5) < 1e-12);
  assert.ok(Math.abs(even.noVigB - 0.5) < 1e-12);
  assert.ok(even.hold > 0);
  const skew = twoWayMarket(-150, 130);
  const rawHome = impliedFromAmerican(-150);
  const rawAway = impliedFromAmerican(130);
  assert.ok(Math.abs(skew.noVigA - rawHome / (rawHome + rawAway)) < 1e-12);
  assert.ok(Math.abs(skew.noVigA + skew.noVigB - 1) < 1e-12);
});

test("honest backtest de-vigs openers and ignores closer-as-stake", () => {
  const rows = [
    sideEvalFromMarket(0.62, 1, { homeOpen: -110, awayOpen: -110, homeClose: -150, awayClose: 130 }),
    sideEvalFromMarket(0.62, 1, { homeOpen: null, awayOpen: null, homeClose: -150, awayClose: 130 }),
  ];
  const honest = honestBacktest(rows, 0.03);
  assert.equal(honest.n, 1);
  assert.ok(honest.avgClv != null);
});
