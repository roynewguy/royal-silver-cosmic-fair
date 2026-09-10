import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../../db.ts";
import { extractGameWarehouse } from "./extract.ts";
import { persistEvalFact, persistObservation, persistQuote, persistSnapshot } from "./persist.ts";
import { yachtPrediction } from "../core/output.ts";
import { yachtVersion } from "../core/versioning.ts";
import { buildYachtLiveSnapshot } from "../live-snapshot.ts";
import type { GameCard, OddsSnapshot } from "../../sports/types.ts";

function odds(): OddsSnapshot {
  return {
    book: "DraftKings", details: null, homeMl: -140, awayMl: 120,
    homeSpread: -1, awaySpread: 1, homeSpreadOdds: -110, awaySpreadOdds: -110,
    total: 8.5, overOdds: -110, underOdds: -110, openHomeSpread: null, openTotal: null,
    openHomeMl: -135, openAwayMl: 115, source: "odds-api", capturedAt: "2026-09-09T17:00:00.000Z",
  };
}

function card(): GameCard {
  return {
    id: "mlb:persist", espnId: "2", sport: "MLB", league: "mlb",
    startAt: "2026-09-09T20:00:00.000Z", status: "scheduled",
    home: { name: "Home", abbr: "HOM", logo: null, score: null, record: "1-0", homeSplit: null, roadSplit: null, starter: null },
    away: { name: "Away", abbr: "AWY", logo: null, score: null, record: "0-1", homeSplit: null, roadSplit: null, starter: null },
    venue: "Park", odds: odds(),
    rank: { market: "moneyline", side: "home", selection: "HOM ML", line: null, price: -140, edgePct: 4, confidence: 60, why: "x", model: "v2-mlb", probability: 0.55 },
    notes: [], injuries: [], weather: null, fetchedAt: "2026-09-09T17:00:00.000Z",
  } as GameCard;
}

async function pgliteSql(): Promise<{ db: PGlite; sql: Sql }> {
  const db = new PGlite();
  const dir = new URL("../../../../migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  }
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, "");
    return (await db.query(query, values)).rows;
  }) as Sql;
  return { db, sql };
}

test("observations and quotes are immutable and idempotent", async () => {
  const { db, sql } = await pgliteSql();
  try {
    const extracted = extractGameWarehouse(card(), "2026-09-09T17:10:00.000Z")!;
    const first = await persistObservation(sql, extracted.observations[0]!);
    const again = await persistObservation(sql, extracted.observations[0]!);
    assert.equal(first, 1);
    assert.equal(again, 0);
    await persistQuote(sql, extracted.quotes[0]!);
    await persistQuote(sql, extracted.quotes[0]!);
    await assert.rejects(
      sql`update yacht_observations set provenance_ok = true where observation_id = ${extracted.observations[0]!.observationId}`,
      /immutable/i,
    );
    await assert.rejects(
      sql`delete from yacht_quotes where quote_id = ${extracted.quotes[0]!.quoteId}`,
      /cannot be deleted/i,
    );
    const extractedFinal = extractGameWarehouse(
      { ...card(), status: "final", home: { ...card().home, score: 5 }, away: { ...card().away, score: 2 } },
      "2026-09-09T17:10:00.000Z",
    )!;
    await persistEvalFact(sql, extractedFinal.evalFacts[0]!);
    await assert.rejects(
      sql`update yacht_eval_facts set provenance_ok = true where fact_id = ${extractedFinal.evalFacts[0]!.factId}`,
      /immutable/i,
    );
    const snap = buildYachtLiveSnapshot(card(), Date.parse("2026-09-09T17:10:00.000Z"));
    assert.ok(snap);
    assert.equal(await persistSnapshot(sql, snap!), 1);
    assert.equal(await persistSnapshot(sql, snap!), 0);
    await assert.rejects(
      sql`update yacht_feature_snapshots set sport = 'nfl' where snapshot_id = ${snap!.snapshotId}`,
      /immutable/i,
    );

  } finally {
    await db.close();
  }
});

test("official remains impossible on Yacht predictions", () => {
  assert.throws(
    () =>
      yachtPrediction({
        sport: "mlb",
        modelVersion: yachtVersion("mlb"),
        probability: 0.5,
        uncertainty: 0.1,
        dataQuality: 0.4,
        predictionAt: "2026-09-09T17:00:00.000Z",
        featureSnapshotId: "yacht_x",
        official: true,
      }),
    /cannot be official/,
  );
});
