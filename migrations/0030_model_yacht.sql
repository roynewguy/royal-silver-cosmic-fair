-- Model Yacht research schema. Additive. Does not touch soak, picks, or V2.

create table if not exists yacht_feature_snapshots (
  snapshot_id text primary key,
  game_id text not null,
  league text not null,
  model_version text not null,
  prediction_at timestamptz not null,
  captured_at timestamptz,
  start_at timestamptz not null,
  features_json text not null,
  market_json text not null,
  missing_json text not null,
  data_quality double precision,
  provenance_ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists yacht_feature_snapshots_game_idx on yacht_feature_snapshots (game_id, prediction_at desc);

create table if not exists yacht_dataset_rows (
  row_id text primary key,
  snapshot_id text not null,
  game_id text not null,
  league text not null default 'mlb',
  season integer,
  start_at timestamptz not null,
  home_abbr text not null,
  away_abbr text not null,
  prediction_at timestamptz not null,
  home_win boolean,
  result text,
  pregame_market_json text not null,
  closing_market_json text,
  missing_json text not null,
  data_quality double precision,
  provenance_ok boolean not null default false,
  dropped_reason text,
  source_notes text
);
create index if not exists yacht_dataset_rows_start_idx on yacht_dataset_rows (start_at, game_id);
create index if not exists yacht_dataset_rows_snapshot_idx on yacht_dataset_rows (snapshot_id);
