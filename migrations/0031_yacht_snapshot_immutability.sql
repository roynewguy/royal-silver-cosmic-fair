-- Model Yacht snapshot immutability + shadow prediction constraints.
-- Additive. Does not touch soak, picks, or V2.
-- Persistence order: INSERT yacht_feature_snapshots first (frozen), then
-- yacht_dataset_rows / yacht_shadow_predictions with snapshot_id FK.
-- In-memory dataset generation may exist without DB.

alter table yacht_dataset_rows alter column league drop default;
alter table yacht_feature_snapshots add column if not exists sport text;
alter table yacht_dataset_rows add column if not exists sport text;
update yacht_feature_snapshots set sport = league where sport is null;
update yacht_dataset_rows set sport = league where sport is null;

create or replace function protect_yacht_feature_snapshot() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Yacht feature snapshot cannot be deleted';
  end if;
  if NEW.snapshot_id is distinct from OLD.snapshot_id
     or NEW.game_id is distinct from OLD.game_id
     or NEW.league is distinct from OLD.league
     or NEW.sport is distinct from OLD.sport
     or NEW.model_version is distinct from OLD.model_version
     or NEW.prediction_at is distinct from OLD.prediction_at
     or NEW.captured_at is distinct from OLD.captured_at
     or NEW.start_at is distinct from OLD.start_at
     or NEW.features_json is distinct from OLD.features_json
     or NEW.market_json is distinct from OLD.market_json
     or NEW.missing_json is distinct from OLD.missing_json
     or NEW.data_quality is distinct from OLD.data_quality
     or NEW.provenance_ok is distinct from OLD.provenance_ok then
    raise exception 'Yacht feature snapshot is immutable';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists protect_yacht_feature_snapshot on yacht_feature_snapshots;
create trigger protect_yacht_feature_snapshot
before update or delete on yacht_feature_snapshots
for each row execute function protect_yacht_feature_snapshot();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'yacht_dataset_rows_snapshot_fk'
  ) then
    alter table yacht_dataset_rows
      add constraint yacht_dataset_rows_snapshot_fk
      foreign key (snapshot_id) references yacht_feature_snapshots(snapshot_id);
  end if;
end $$;

create table if not exists yacht_shadow_predictions (
  id bigserial primary key,
  sport text not null,
  game_id text not null,
  model_version text not null,
  snapshot_id text,
  generated_at timestamptz not null default now(),
  prediction_at timestamptz not null,
  probability double precision not null,
  uncertainty double precision,
  data_quality double precision,
  market_probability double precision,
  official boolean not null default false,
  constraint yacht_shadow_sport_ck check (sport in ('mlb','nfl','ncaaf','nba','wnba','nhl','ncaab','ufc')),
  constraint yacht_shadow_version_ck check (model_version like 'model-yacht-%'),
  constraint yacht_shadow_probability_ck check (probability >= 0 and probability <= 1),
  constraint yacht_shadow_uncertainty_ck check (uncertainty is null or (uncertainty >= 0 and uncertainty <= 1)),
  constraint yacht_shadow_quality_ck check (data_quality is null or (data_quality >= 0 and data_quality <= 1)),
  constraint yacht_shadow_market_p_ck check (market_probability is null or (market_probability >= 0 and market_probability <= 1)),
  constraint yacht_shadow_official_ck check (official = false)
);
create index if not exists yacht_shadow_predictions_sport_idx on yacht_shadow_predictions (sport, game_id, generated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'yacht_shadow_predictions_snapshot_fk'
  ) then
    alter table yacht_shadow_predictions
      add constraint yacht_shadow_predictions_snapshot_fk
      foreign key (snapshot_id) references yacht_feature_snapshots(snapshot_id);
  end if;
end $$;
