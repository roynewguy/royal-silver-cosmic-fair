import { getSql } from "../../db.ts";
import type { GameCard } from "../../sports/types.ts";
import { buildYachtLiveSnapshot } from "../live-snapshot.ts";
import { extractGameWarehouse } from "./extract.ts";
import { markYachtCollectorFailed, markYachtCollectorOk } from "./health.ts";
import { persistEvalFact, persistObservation, persistQuote, persistSnapshot, recordCollectionRun } from "./persist.ts";
import type { CollectResult } from "./types.ts";

function failedResult(games: number, error: string): CollectResult {
  return {
    ok: false,
    games,
    insertedObservations: 0,
    insertedQuotes: 0,
    insertedEvalFacts: 0,
    insertedSnapshots: 0,
    skipped: games,
    error,
  };
}

/**
 * Research-only warehouse write. Must never throw into V2 scan/soak/post.
 */
export async function collectYachtWarehouse(
  games: GameCard[],
  collectedAt = new Date().toISOString(),
): Promise<CollectResult> {
  try {
    const sql = await getSql();
    let insertedObservations = 0;
    let insertedQuotes = 0;
    let insertedEvalFacts = 0;
    let insertedSnapshots = 0;
    let skipped = 0;
    let persistErrors = 0;
    for (const game of games) {
      try {
        const extracted = extractGameWarehouse(game, collectedAt);
        if (!extracted) {
          skipped += 1;
          continue;
        }
        for (const obs of extracted.observations) insertedObservations += await persistObservation(sql, obs);
        for (const q of extracted.quotes) insertedQuotes += await persistQuote(sql, q);
        for (const fact of extracted.evalFacts) insertedEvalFacts += await persistEvalFact(sql, fact);
        const snap = buildYachtLiveSnapshot(game, Date.parse(collectedAt));
        if (snap) insertedSnapshots += await persistSnapshot(sql, snap);
      } catch {
        persistErrors += 1;
        skipped += 1;
      }
    }
    const inserted = insertedObservations + insertedQuotes + insertedEvalFacts + insertedSnapshots;
    const failed = persistErrors > 0 && inserted === 0;
    if (failed) {
      markYachtCollectorFailed("yacht collection persist failed");
      try {
        await recordCollectionRun(sql, {
          ok: false,
          error: "yacht collection persist failed",
          games: games.length,
          observations: insertedObservations,
          quotes: insertedQuotes,
          snapshots: insertedSnapshots,
          skipped,
        });
      } catch {
        /* run log is best-effort */
      }
      return {
        ok: false,
        games: games.length,
        insertedObservations,
        insertedQuotes,
        insertedEvalFacts,
        insertedSnapshots,
        skipped,
        error: "yacht collection persist failed",
      };
    }
    markYachtCollectorOk(games.length);
    try {
      await recordCollectionRun(sql, {
        ok: true,
        error: null,
        games: games.length,
        observations: insertedObservations,
        quotes: insertedQuotes,
        snapshots: insertedSnapshots,
        skipped,
      });
    } catch {
      /* run log is best-effort */
    }
    return {
      ok: true,
      games: games.length,
      insertedObservations,
      insertedQuotes,
      insertedEvalFacts,
      insertedSnapshots,
      skipped,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "yacht collection failed";
    markYachtCollectorFailed(message);
    return failedResult(games.length, message);
  }
}

/** Isolated hook for the V2 tick. Never rethrows. */
export async function collectYachtWarehouseSafe(games: GameCard[]): Promise<CollectResult> {
  try {
    return await collectYachtWarehouse(games);
  } catch (error) {
    const message = error instanceof Error ? error.message : "yacht collection failed";
    markYachtCollectorFailed(message);
    return failedResult(games.length, message);
  }
}
