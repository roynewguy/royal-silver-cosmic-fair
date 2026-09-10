-- Model Yacht Data Engine. Additive research warehouse.
-- Does not touch soak, picks, Discord, or V2 production tables.

create table if not exists yacht_observations (
  observation_id text primary key,
  sport text not null,
  game_id text not null,
  event_id text,
  source text not null,
  source_id text,
  kind text not null,
  schema_version text not null,
  collected_at timestamptz not null,
  known_at timestamptz,
  effective_at timestamptz,
  payload_json text not null,
  checksum text not null,
  provenance_ok boolean not null default false,
  quality double precision not null default 0,
  constraint yacht_obs_sport_ck check (sport in ('mlb','nfl','ncaaf','nba','wnba','nhl','ncaab','ufc')),
  constraint yacht_obs_quality_ck check (quality >= 0 and quality <= 1)
);
create index if not exists yacht_observations_game_idx on yacht_observations (sport, game_id, kind);

create table if not exists yacht_quotes (
  quote_id text primary key,
  sport text not null,
  game_id text not null,
  event_id text,
  sportsbook text not null,
  market text not null,
  side text not null,
  line double precision,
  price double precision not null,
  captured_at timestamptz,
  source text not null,
  source_id text,
  schema_version text not null,
  collected_at timestamptz not null,
  checksum text not null,
  provenance_ok boolean not null default false,
  evaluation_only boolean not null default false,
  role text not null,
  constraint yacht_quote_sport_ck check (sport in ('mlb','nfl','ncaaf','nba','wnba','nhl','ncaab','ufc')),
  constraint yacht_quote_role_ck check (role in ('current','open_claimed','close'))
);
create index if not exists yacht_quotes_game_idx on yacht_quotes (sport, game_id, sportsbook, market, side, captured_at);

create table if not exists yacht_eval_facts (
  fact_id text primary key,
  sport text not null,
  game_id text not null,
  kind text not null,
  source text not null,
  collected_at timestamptz not null,
  known_at timestamptz,
  payload_json text not null,
  checksum text not null,
  provenance_ok boolean not null default false,
  constraint yacht_eval_sport_ck check (sport in ('mlb','nfl','ncaaf','nba','wnba','nhl','ncaab','ufc')),
  constraint yacht_eval_kind_ck check (kind in ('score','result','close','status'))
);
create index if not exists yacht_eval_facts_game_idx on yacht_eval_facts (sport, game_id, kind);

create table if not exists yacht_collection_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default false,
  error text,
  games integer not null default 0,
  observations integer not null default 0,
  quotes integer not null default 0,
  snapshots integer not null default 0,
  skipped integer not null default 0
);

create or replace function protect_yacht_research_row() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Yacht research row cannot be deleted';
  end if;
  raise exception 'Yacht research row is immutable';
end;
$$ language plpgsql;

drop trigger if exists protect_yacht_observations on yacht_observations;
create trigger protect_yacht_observations
before update or delete on yacht_observations
for each row execute function protect_yacht_research_row();

drop trigger if exists protect_yacht_quotes on yacht_quotes;
create trigger protect_yacht_quotes
before update or delete on yacht_quotes
for each row execute function protect_yacht_research_row();

drop trigger if exists protect_yacht_eval_facts on yacht_eval_facts;
create trigger protect_yacht_eval_facts
before update or delete on yacht_eval_facts
for each row execute function protect_yacht_research_row();
