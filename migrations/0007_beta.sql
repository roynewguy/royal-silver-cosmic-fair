alter table games add column if not exists model_inputs_json text;

alter table picks add column if not exists selected_odds integer;
alter table picks add column if not exists posted_odds integer;
alter table picks add column if not exists closing_odds integer;
alter table picks add column if not exists clv double precision;
alter table picks add column if not exists selected_at timestamptz;

create table if not exists research_cache (
  game_id text primary key,
  fingerprint text not null,
  skip boolean not null default false,
  reason text not null default '',
  skip_reason text,
  updated_at timestamptz not null default now()
);
