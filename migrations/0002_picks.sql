-- Picks Boat Boyz desk: unowned shared rows (no auth).
create table if not exists desk_meta (
  id integer primary key check (id = 1),
  min_edge_pct double precision not null default 3.0,
  min_confidence integer not null default 58,
  post_lead_minutes integer not null default 150,
  last_scan_at timestamptz,
  last_desk_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into desk_meta (id) values (1) on conflict do nothing;

create table if not exists games (
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
  home_logo text,
  away_logo text,
  home_score integer,
  away_score integer,
  home_record text,
  away_record text,
  venue text,
  odds_json text not null default '{}',
  rank_json text,
  updated_at timestamptz not null default now()
);

create index if not exists games_sport_start_idx on games (sport, start_at);
create index if not exists games_status_idx on games (status);

create table if not exists picks (
  id serial primary key,
  game_id text not null,
  sport text not null,
  league text not null,
  matchup text not null,
  market text not null,
  selection text not null,
  side text not null,
  locked_line double precision,
  locked_odds integer not null,
  locked_odds_json text not null default '{}',
  reason text not null,
  research text,
  confidence integer not null,
  edge_pct double precision not null,
  units double precision not null default 1,
  status text not null,
  result text,
  profit_units double precision,
  start_at timestamptz not null,
  post_at timestamptz not null,
  posted_at timestamptz,
  graded_at timestamptz,
  discord_message text,
  skip_reason text,
  created_at timestamptz not null default now()
);

create index if not exists picks_sport_status_idx on picks (sport, status);
create index if not exists picks_game_id_idx on picks (game_id);
create index if not exists picks_post_at_idx on picks (post_at);

create table if not exists desk_log (
  id serial primary key,
  kind text not null,
  sport text,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists desk_log_created_idx on desk_log (created_at desc);
