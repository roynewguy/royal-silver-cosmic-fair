-- Model Yacht intelligence: challenger predictions, manifests, lifecycle.
-- Additive. Does not touch soak, picks, V2, Discord, or truth gate.

create table if not exists yacht_training_manifests (
  manifest_id text primary key,
  sport text not null,
  model_version text not null,
  candidate_kind text not null,
  feature_schema_version text not null,
  train_from timestamptz not null,
  train_to timestamptz not null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  test_from timestamptz not null,
  test_to timestamptz not null,
  n_games integer not null,
  n_train integer not null,
  n_valid integer not null,
  n_test integer not null,
  feature_list_json text not null,
  hyperparameters_json text not null,
  calibration_method text not null,
  artifact_checksum text not null,
  trained_at timestamptz not null,
  commit_sha text,
  created_at timestamptz not null default now(),
  constraint yacht_manifest_sport_ck check (sport in ('mlb','nfl','ncaaf','nba','wnba','nhl','ncaab','ufc')),
  constraint yacht_manifest_kind_ck check (candidate_kind in ('logreg','gbt','market')),
  constraint yacht_manifest_version_ck check (model_version like 'model-yacht-%'),
  constraint yacht_manifest_cal_ck check (calibration_method in ('none','platt','isotonic')),
  constraint yacht_manifest_order_ck check (train_to <= valid_from and valid_to <= test_from)
);

create or replace function protect_yacht_training_manifest() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Yacht training manifest cannot be deleted';
  end if;
  raise exception 'Yacht training manifest is immutable';
end;
$$ language plpgsql;

drop trigger if exists protect_yacht_training_manifest on yacht_training_manifests;
create trigger protect_yacht_training_manifest
before update or delete on yacht_training_manifests
for each row execute function protect_yacht_training_manifest();

create table if not exists yacht_model_lifecycle (
  sport text not null,
  model_version text not null,
  lifecycle text not null,
  evidence_json text,
  ceo_approved boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (sport, model_version),
  constraint yacht_lifecycle_sport_ck check (sport in ('mlb','nfl','ncaaf','nba','wnba','nhl','ncaab','ufc','mls','epl')),
  constraint yacht_lifecycle_state_ck check (lifecycle in (
    'BLOCKED','DATA_COLLECTION','SHADOW','VALIDATING','CANARY_READY','VERIFIED','PRODUCTION'
  )),
  constraint yacht_lifecycle_version_ck check (model_version like 'model-yacht-%')
);

create table if not exists yacht_challenger_predictions (
  id bigserial primary key,
  sport text not null,
  game_id text not null,
  league text not null,
  start_at timestamptz not null,
  model_version text not null,
  candidate_kind text not null,
  snapshot_id text,
  prediction_at timestamptz not null,
  probability double precision not null,
  uncertainty double precision not null,
  data_quality double precision not null,
  market_probability double precision,
  model_vs_market double precision,
  result smallint,
  closing_line double precision,
  clv double precision,
  research_stance text not null default 'PASS',
  pass_reasons_json text not null default '[]',
  lifecycle text not null default 'SHADOW',
  official boolean not null default false,
  generated_at timestamptz not null default now(),
  constraint yacht_chal_sport_ck check (sport in ('mlb','nfl','ncaaf','nba','wnba','nhl','ncaab','ufc')),
  constraint yacht_chal_kind_ck check (candidate_kind in ('logreg','gbt','market')),
  constraint yacht_chal_version_ck check (model_version like 'model-yacht-%'),
  constraint yacht_chal_probability_ck check (probability >= 0 and probability <= 1),
  constraint yacht_chal_uncertainty_ck check (uncertainty >= 0 and uncertainty <= 1),
  constraint yacht_chal_quality_ck check (data_quality >= 0 and data_quality <= 1),
  constraint yacht_chal_market_p_ck check (market_probability is null or (market_probability >= 0 and market_probability <= 1)),
  constraint yacht_chal_result_ck check (result is null or result in (0, 1)),
  constraint yacht_chal_official_ck check (official = false),
  constraint yacht_chal_stance_ck check (research_stance in ('PASS','CONSIDER'))
);

create unique index if not exists yacht_challenger_idempotent_idx
  on yacht_challenger_predictions (sport, game_id, model_version, prediction_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'yacht_challenger_snapshot_fk'
  ) then
    alter table yacht_challenger_predictions
      add constraint yacht_challenger_snapshot_fk
      foreign key (snapshot_id) references yacht_feature_snapshots(snapshot_id);
  end if;
end $$;
