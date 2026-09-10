-- Per-sport production champion registry.
-- V2 remains the seeded default. CEO verify/promote/rollback is the only way
-- a sport's live champion changes. One sport cannot overwrite another.

alter table model_registry add column if not exists verified boolean not null default false;
update model_registry set verified = true where model_version like 'v2-%';

create table if not exists sport_champions (
  sport text primary key,
  champion_version text not null,
  previous_version text,
  promoted_at timestamptz not null default now(),
  promoted_by text,
  reason text
);

create table if not exists sport_champion_history (
  id bigserial primary key,
  sport text not null,
  action text not null,
  from_version text,
  to_version text not null,
  operator_id text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists sport_champion_history_sport_idx
  on sport_champion_history (sport, created_at desc);

create table if not exists sport_model_verification (
  model_version text not null,
  sport text not null,
  verified_at timestamptz not null default now(),
  operator_id text,
  reason text,
  primary key (model_version, sport)
);

insert into sport_champions (sport, champion_version, previous_version, reason)
values
  ('mlb', 'v2-mlb', null, 'Shipped V2 default'),
  ('nba', 'v2-nba', null, 'Shipped V2 default'),
  ('nfl', 'v2-nfl', null, 'Shipped V2 default'),
  ('nhl', 'v2-nhl', null, 'Shipped V2 default'),
  ('ncaaf', 'v2-ncaaf', null, 'Shipped V2 default'),
  ('wnba', 'v2-wnba', null, 'Shipped V2 default'),
  ('ncaab', 'v2-ncaab', null, 'Shipped V2 default'),
  ('ufc', 'v2-ufc', null, 'Shipped V2 default')
on conflict (sport) do nothing;

insert into sport_model_verification (model_version, sport, reason)
values
  ('v2-mlb', 'mlb', 'Shipped V2 default'),
  ('v2-nba', 'nba', 'Shipped V2 default'),
  ('v2-nfl', 'nfl', 'Shipped V2 default'),
  ('v2-nhl', 'nhl', 'Shipped V2 default'),
  ('v2-ncaaf', 'ncaaf', 'Shipped V2 default'),
  ('v2-wnba', 'wnba', 'Shipped V2 default'),
  ('v2-ncaab', 'ncaab', 'Shipped V2 default'),
  ('v2-ufc', 'ufc', 'Shipped V2 default')
on conflict (model_version, sport) do nothing;
