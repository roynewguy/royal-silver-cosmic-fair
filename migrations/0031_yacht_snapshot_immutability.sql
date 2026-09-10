-- Model Yacht snapshot immutability. Additive. Does not touch soak, picks, or V2.
-- Persistence order: INSERT yacht_feature_snapshots first, then yacht_dataset_rows
-- (FK snapshot_id). In-memory dataset generation may exist without DB.

alter table yacht_dataset_rows alter column league drop default;

create or replace function protect_yacht_feature_snapshot() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Yacht feature snapshot cannot be deleted';
  end if;
  if NEW.snapshot_id is distinct from OLD.snapshot_id
     or NEW.game_id is distinct from OLD.game_id
     or NEW.league is distinct from OLD.league
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
