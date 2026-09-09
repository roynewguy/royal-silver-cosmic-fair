import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibilityReasons, isEligible, promoteChallenger, rollbackToV2, MIN_FORWARD_BETS } from "./promotion.ts";
import { canQueueOfficial, isShadowModel, PRODUCTION_MODELS } from "./registry.ts";
import { walkForwardFolds } from "./walk-forward.ts";
import { plattApply, plattFit } from "./platt.ts";
import type { MlbRow } from "./types.ts";

test("V2 stays the only official model even after a successful candidate mark", () => {
  assert.equal(PRODUCTION_MODELS.mlb, "v2-mlb");
  assert.equal(canQueueOfficial("v2-mlb"), true);
  assert.equal(canQueueOfficial("v3-mlb-logreg"), false);
  assert.equal(isShadowModel("v4-mlb-ensemble"), true);
  const stats = { n: MIN_FORWARD_BETS, brier: 0.2, roi: 0.04, clv: 0.01, calibrationDelta: 0.01, maxDrawdown: -8 };
  const champ = { n: 400, brier: 0.24, roi: 0.01, clv: 0.002, calibrationDelta: 0.02, maxDrawdown: -10 };
  assert.equal(isEligible(stats, champ), true);
  const promoted = promoteChallenger({ version: "v4-mlb-ensemble", sport: "mlb", stats, champion: champ });
  assert.equal(promoted.ok, true);
  assert.equal(promoted.livePosting, false);
  assert.equal(canQueueOfficial("v4-mlb-ensemble"), false);
  const live = promoteChallenger({ version: "v4-mlb-ensemble", sport: "mlb", stats, champion: champ, confirmLive: true });
  assert.equal(live.ok, false);
  assert.match(live.note, /V2 remains/);
  assert.equal(rollbackToV2("mlb").ok, true);
});

test("thin or losing challengers are not eligible", () => {
  const champ = { n: 400, brier: 0.22, roi: 0.02, clv: 0.01, calibrationDelta: 0.01, maxDrawdown: -5 };
  const reasons = eligibilityReasons({ n: 12, brier: 0.3, roi: -0.2, clv: -0.04, calibrationDelta: 0.2, maxDrawdown: -40 }, champ);
  assert.ok(reasons.length >= 3);
});

test("walk-forward never trains on later games", () => {
  const rows: MlbRow[] = [];
  for (let i = 0; i < 12; i += 1) {
    rows.push({
      gameId: `g${i}`,
      league: "mlb",
      season: 2026,
      startAt: `2026-0${Math.floor(i / 3) + 1}-0${(i % 3) + 1}T00:00:00Z`,
      homeAbbr: "AAA",
      awayAbbr: "BBB",
      homeWin: i % 2 === 0,
      features: { capturedAt: "", knownBeforeStart: true, home: {} as never, away: {} as never, homeStarter: { name: null, era: null, wins: null, losses: null }, awayStarter: { name: null, era: null, wins: null, losses: null }, venue: null },
      market: { sportsbook: "dk", homeOpen: -110, awayOpen: -110, homeClose: -115, awayClose: -105, impliedHomeClose: 0.53 },
    });
  }
  const folds = walkForwardFolds(rows, [
    { trainTo: "2026-02-01T00:00:00Z", validTo: "2026-03-01T00:00:00Z" },
    { trainTo: "2026-03-01T00:00:00Z", validTo: "2026-04-01T00:00:00Z" },
  ]);
  assert.equal(folds.length, 2);
  for (const fold of folds) {
    const lastTrain = fold.split.train.at(-1)?.startAt ?? "";
    const firstValid = fold.split.valid[0]?.startAt;
    const firstTest = fold.split.test[0]?.startAt;
    if (firstValid) assert.ok(+new Date(firstValid) > +new Date(lastTrain));
    if (firstTest) assert.ok(+new Date(firstTest) > +new Date(fold.validTo));
  }
});

test("platt scaling is research-only math", () => {
  const pairs = Array.from({ length: 120 }, (_, i) => ({ p: 0.7, y: i < 70 ? 1 : 0 }));
  const coef = plattFit(pairs);
  const adj = plattApply(0.7, coef);
  assert.ok(adj < 0.7);
});
