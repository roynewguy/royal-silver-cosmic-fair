create table if not exists historical_games (
  game_id text primary key,
  espn_id text not null,
  sport text not null,
  league text not null,
  season integer not null,
  start_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  home_abbr text not null,
  away_abbr text not null,
  home_score integer,
  away_score integer,
  status text not null,
  venue text,
  result text
);

create table if not exists historical_odds (
  game_id text not null,
  sportsbook text not null,
  captured_kind text not null,
  market text not null,
  home_price integer,
  away_price integer,
  primary key (game_id, sportsbook, captured_kind, market)
);

create table if not exists historical_team_features (
  game_id text not null,
  team_abbr text not null,
  home_away text not null,
  features_json text not null,
  captured_at timestamptz not null,
  primary key (game_id, team_abbr)
);

create table if not exists historical_player_features (
  game_id text not null,
  team_abbr text not null,
  player text not null,
  role text not null,
  features_json text not null,
  captured_at timestamptz not null,
  primary key (game_id, team_abbr, player, role)
);

create table if not exists research_predictions (
  game_id text not null,
  model_version text not null,
  generated_at timestamptz not null default now(),
  market text not null default 'moneyline',
  side text,
  probability double precision not null,
  market_probability double precision,
  estimated_edge double precision,
  official boolean not null default false,
  primary key (game_id, model_version)
);
