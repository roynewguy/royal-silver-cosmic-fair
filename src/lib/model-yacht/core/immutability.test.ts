import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("yacht snapshots are immutable; shadow predictions cannot be official or out of range", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../../../../migrations/", import.meta.url);
    for (const f of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
      await db.exec(await readFile(new URL(f, dir), "utf8"));
    }
    await db.query(
      `insert into yacht_feature_snapshots
        (snapshot_id, game_id, league, sport, model_version, prediction_at, start_at, features_json, market_json, missing_json, provenance_ok)
       values ('yacht_testsnap', 'mlb:1', 'mlb', 'mlb', 'model-yacht-mlb-2026.09.1', '2026-06-01T17:00:00Z', '2026-06-01T20:00:00Z', '[]', '{}', '[]', false)`,
    );
    await assert.rejects(
      db.query(`update yacht_feature_snapshots set provenance_ok = true where snapshot_id = 'yacht_testsnap'`),
      /immutable/i,
    );
    await assert.rejects(
      db.query(`update yacht_feature_snapshots set sport = 'nfl' where snapshot_id = 'yacht_testsnap'`),
      /immutable/i,
    );
    await assert.rejects(
      db.query(`delete from yacht_feature_snapshots where snapshot_id = 'yacht_testsnap'`),
      /cannot be deleted/i,
    );
    await db.query(
      `insert into yacht_dataset_rows
        (row_id, snapshot_id, game_id, league, start_at, home_abbr, away_abbr, prediction_at, pregame_market_json, missing_json)
       values ('row1', 'yacht_testsnap', 'mlb:1', 'mlb', '2026-06-01T20:00:00Z', 'LAD', 'SF', '2026-06-01T17:00:00Z', '{}', '[]')`,
    );
    await assert.rejects(
      db.query(
        `insert into yacht_dataset_rows
          (row_id, snapshot_id, game_id, league, start_at, home_abbr, away_abbr, prediction_at, pregame_market_json, missing_json)
         values ('row2', 'missing_snap', 'mlb:2', 'mlb', '2026-06-01T20:00:00Z', 'NYY', 'BOS', '2026-06-01T17:00:00Z', '{}', '[]')`,
      ),
      /foreign key|violates/i,
    );
    await db.query(
      `insert into yacht_shadow_predictions
        (sport, game_id, model_version, snapshot_id, prediction_at, probability, uncertainty, data_quality, official)
       values ('mlb', 'mlb:1', 'model-yacht-mlb-2026.09.1', 'yacht_testsnap', '2026-06-01T17:00:00Z', 0.56, 0.2, 0.4, false)`,
    );
    await assert.rejects(
      db.query(
        `insert into yacht_shadow_predictions
          (sport, game_id, model_version, prediction_at, probability, official)
         values ('mlb', 'mlb:2', 'model-yacht-mlb-2026.09.1', '2026-06-01T17:00:00Z', 1.2, false)`,
      ),
      /check|violates/i,
    );
    await assert.rejects(
      db.query(
        `insert into yacht_shadow_predictions
          (sport, game_id, model_version, prediction_at, probability, official)
         values ('mlb', 'mlb:3', 'model-yacht-mlb-2026.09.1', '2026-06-01T17:00:00Z', 0.5, true)`,
      ),
      /check|violates/i,
    );
    await assert.rejects(
      db.query(
        `insert into yacht_shadow_predictions
          (sport, game_id, model_version, prediction_at, probability)
         values ('mls', 'mls:1', 'model-yacht-mlb-2026.09.1', '2026-06-01T17:00:00Z', 0.5)`,
      ),
      /check|violates/i,
    );
  } finally {
    await db.close();
  }
});
