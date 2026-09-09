-- Champion/challenger registry, pass reasons, multi-book quotes, lab Discord cooldowns.
-- Additive only. Never deletes historical warehouse or pick rows.

create table if not exists model_registry (
  model_name text not null,
  model_version text not null,
  sport text not null,
  status text not null default 'shadow',
  role text not null default 'challenger',
  created_at timestamptz not null default now(),
  training_period text,
  features_json text not null default '[]',
  sample_size integer,
  brier double precision,
  log_loss double precision,
  accuracy double precision,
  roi double precision,
  clv double precision,
  average_edge double precision,
  bet_count integer,
  calibration_json text,
  notes text,
  primary key (model_version, sport)
);

create table if not exists model_promotion_log (
  id bigserial primary key,
  sport text not null,
  from_version text,
  to_version text not null,
  action text not null,
  live_posting boolean not null default false,
  operator_id text,
  reason text,
  stats_json text not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists pass_log (
  id bigserial primary key,
  game_id text not null,
  sport text not null,
  model_version text,
  pass_reason text not null,
  detail text,
  edge_pct double precision,
  expected_value_pct double precision,
  data_quality double precision,
  uncertainty double precision,
  captured_at timestamptz not null default now()
);
create index if not exists pass_log_game_idx on pass_log (game_id, captured_at desc);
create index if not exists pass_log_reason_idx on pass_log (pass_reason, captured_at desc);

create table if not exists book_quotes (
  id bigserial primary key,
  game_id text not null,
  captured_at timestamptz not null default now(),
  sportsbook text not null,
  market text not null default 'moneyline',
  home_price integer,
  away_price integer
);
create index if not exists book_quotes_game_idx on book_quotes (game_id, captured_at desc);

alter table model_predictions add column if not exists expected_value double precision;
alter table model_predictions add column if not exists uncertainty double precision;
alter table model_predictions add column if not exists data_quality double precision;
alter table model_predictions add column if not exists qualified boolean;
alter table model_predictions add column if not exists posted boolean not null default false;
alter table model_predictions add column if not exists pass_reason text;
alter table model_predictions add column if not exists official boolean not null default false;
alter table model_predictions add column if not exists ledger text not null default 'paper';

alter table desk_meta add column if not exists lab_post_at timestamptz;
alter table desk_meta add column if not exists no_play_on text;
