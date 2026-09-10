import type { Sql } from "../../db.ts";
import type { YachtEvalFact, YachtObservation, YachtQuote } from "./types.ts";
import type { YachtSnapshot } from "../core/snapshot.ts";

async function inserted(sql: Sql, query: Promise<unknown[]>): Promise<number> {
  try {
    const rows = await query;
    return rows.length;
  } catch (error) {
    const msg = String(error);
    if (/duplicate|unique|already exists/i.test(msg)) return 0;
    throw error;
  }
}

export async function persistObservation(sql: Sql, row: YachtObservation): Promise<number> {
  return inserted(
    sql,
    sql`
      insert into yacht_observations (
        observation_id, sport, game_id, event_id, source, source_id, kind, schema_version,
        collected_at, known_at, effective_at, payload_json, checksum, provenance_ok, quality
      ) values (
        ${row.observationId}, ${row.sport}, ${row.gameId}, ${row.eventId}, ${row.source}, ${row.sourceId},
        ${row.kind}, ${row.schemaVersion}, ${row.collectedAt}, ${row.knownAt}, ${row.effectiveAt},
        ${JSON.stringify(row.payload)}, ${row.checksum}, ${row.provenanceOk}, ${row.quality}
      )
      on conflict (observation_id) do nothing
      returning observation_id
    `,
  );
}

export async function persistQuote(sql: Sql, row: YachtQuote): Promise<number> {
  return inserted(
    sql,
    sql`
      insert into yacht_quotes (
        quote_id, sport, game_id, event_id, sportsbook, market, side, line, price,
        captured_at, source, source_id, schema_version, collected_at, checksum,
        provenance_ok, evaluation_only, role
      ) values (
        ${row.quoteId}, ${row.sport}, ${row.gameId}, ${row.eventId}, ${row.sportsbook}, ${row.market},
        ${row.side}, ${row.line}, ${row.price}, ${row.capturedAt}, ${row.source}, ${row.sourceId},
        ${row.schemaVersion}, ${row.collectedAt}, ${row.checksum}, ${row.provenanceOk},
        ${row.evaluationOnly}, ${row.role}
      )
      on conflict (quote_id) do nothing
      returning quote_id
    `,
  );
}

export async function persistEvalFact(sql: Sql, row: YachtEvalFact): Promise<number> {
  return inserted(
    sql,
    sql`
      insert into yacht_eval_facts (
        fact_id, sport, game_id, kind, source, collected_at, known_at, payload_json, checksum, provenance_ok
      ) values (
        ${row.factId}, ${row.sport}, ${row.gameId}, ${row.kind}, ${row.source}, ${row.collectedAt},
        ${row.knownAt}, ${JSON.stringify(row.payload)}, ${row.checksum}, ${row.provenanceOk}
      )
      on conflict (fact_id) do nothing
      returning fact_id
    `,
  );
}

export async function persistSnapshot(sql: Sql, snap: YachtSnapshot): Promise<number> {
  return inserted(
    sql,
    sql`
      insert into yacht_feature_snapshots (
        snapshot_id, game_id, league, sport, model_version, prediction_at, captured_at, start_at,
        features_json, market_json, missing_json, data_quality, provenance_ok
      ) values (
        ${snap.snapshotId}, ${snap.gameId}, ${snap.league}, ${snap.sport}, ${snap.modelVersion},
        ${snap.predictionAt}, ${snap.market.capturedAt}, ${snap.startAt},
        ${JSON.stringify(snap.features)}, ${JSON.stringify(snap.market)}, ${JSON.stringify(snap.missing)},
        ${snap.dataQuality}, ${snap.provenanceOk}
      )
      on conflict (snapshot_id) do nothing
      returning snapshot_id
    `,
  );
}

export async function recordCollectionRun(
  sql: Sql,
  row: {
    ok: boolean;
    error: string | null;
    games: number;
    observations: number;
    quotes: number;
    snapshots: number;
    skipped: number;
  },
): Promise<void> {
  await sql`
    insert into yacht_collection_runs (ok, error, games, observations, quotes, snapshots, skipped, finished_at)
    values (${row.ok}, ${row.error}, ${row.games}, ${row.observations}, ${row.quotes}, ${row.snapshots}, ${row.skipped}, now())
  `;
}
