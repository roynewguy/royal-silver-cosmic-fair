alter table desk_meta add column if not exists odds_remaining integer;
alter table desk_meta add column if not exists odds_used integer;
alter table desk_meta add column if not exists odds_last integer;
alter table desk_meta add column if not exists odds_updated_at timestamptz;

create table if not exists dk_cache (
  game_id text not null,
  market text not null,
  odds_json text not null,
  checks integer not null default 0,
  verified_at timestamptz not null default now(),
  primary key (game_id, market)
);
