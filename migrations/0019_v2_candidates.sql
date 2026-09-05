create table if not exists research_v2_snapshots (
  id bigserial primary key,
  game_id text not null,
  model_version text not null,
  generated_at timestamptz not null default now(),
  market text,
  selection text,
  side text,
  probability double precision,
  raw_implied double precision,
  novig_implied double precision,
  market_hold double precision,
  edge_pct double precision,
  confidence double precision,
  data_quality double precision,
  missing_json text not null default '[]',
  pass_reason text,
  price integer,
  line double precision,
  features_json text not null default '{}',
  first_price integer,
  official boolean not null default false
);

create index if not exists research_v2_game_idx on research_v2_snapshots (game_id, generated_at);

create table if not exists market_tape (
  id bigserial primary key,
  game_id text not null,
  captured_at timestamptz not null default now(),
  source text,
  book text,
  home_ml integer,
  away_ml integer,
  home_spread double precision,
  total double precision
);

create index if not exists market_tape_game_idx on market_tape (game_id, captured_at);
