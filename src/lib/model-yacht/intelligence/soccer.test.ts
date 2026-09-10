import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dixonColesAdjust,
  normalizeThreeWay,
  poissonThreeWay,
  soccerLifecycle,
  soccerMayPostOfficial,
  soccerMayShadow,
  threeWayNoVig,
  twoWayFromSoccer,
} from "./soccer.ts";

test("MLS and EPL stay BLOCKED and cannot post or shadow", () => {
  assert.equal(soccerLifecycle(), "BLOCKED");
  assert.equal(soccerMayPostOfficial("mls"), false);
  assert.equal(soccerMayPostOfficial("epl"), false);
  assert.equal(soccerMayShadow("mls"), false);
  assert.throws(() => twoWayFromSoccer(), /two-way/);
});

test("1X2 no-vig uses all three outcomes", () => {
  const p = threeWayNoVig({ home: -120, draw: 250, away: 320 });
  assert.ok(p);
  assert.ok(Math.abs(p!.home + p!.draw + p!.away - 1) < 1e-9);
  assert.equal(threeWayNoVig({ home: -120, draw: 250, away: null as unknown as number }), null);
});

test("Poisson 1X2 requires proven rates and stays normalized", () => {
  const p = poissonThreeWay({ home: 1.6, away: 1.1 });
  assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-6);
  assert.ok(p.home > p.away);
  assert.throws(() => poissonThreeWay({ home: 0, away: 1 }), /invent/);
  const dc = dixonColesAdjust({ home: 1.4, away: 1.2 }, 0.1);
  const n = normalizeThreeWay(dc);
  assert.ok(Math.abs(n.home + n.draw + n.away - 1) < 1e-9);
});
