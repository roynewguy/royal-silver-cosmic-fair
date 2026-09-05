-- Live V2 snapshots for later V3 training. Pre-game features only; never rewrite posted rows.
create table if not exists game_history (
  id text primary key,
  espn_id text not null,
  sport text not null,
  league text not null,
  start_at timestamptz not null,
  status text not null,
  home_team text not null,
  away_team text not null,
  home_abbr text not null,
  away_abbr text not null,
  home_score integer,
  away_score integer,
  pregame_json text not null default '{}',
  pregame_locked boolean not null default false,
  result text,
  updated_at timestamptz not null default now()
);

create table if not exists model_predictions (
  game_id text not null,
  model_version text not null,
  stage text not null,
  captured_at timestamptz not null,
  sport text not null,
  league text not null,
  market text,
  selection text,
  side text,
  model_probability double precision,
  market_implied double precision,
  model_edge double precision,
  confidence integer,
  price integer,
  line double precision,
  book text,
  odds_source text,
  features_json text not null default '{}',
  result text,
  closing_price integer,
  clv double precision,
  primary key (game_id, model_version, stage)
);

create index if not exists model_predictions_sport_idx on model_predictions (sport, captured_at desc);
