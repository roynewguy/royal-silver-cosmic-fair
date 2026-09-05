alter table picks add column if not exists settlement_evidence text;
alter table desk_meta add column if not exists worker_lock_token text;
create table if not exists operational_events (
  id bigserial primary key,
  kind text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists operational_events_time_idx on operational_events(created_at, kind);
alter table picks add column if not exists result_delivery text;
alter table picks add column if not exists result_message_id text;
alter table picks add column if not exists result_message text;
alter table picks add column if not exists result_attempted_at timestamptz;
alter table picks add column if not exists closing_snapshot_json text;

-- Superseded game-only indexes incorrectly couple paper/manual/auto tickets.
drop index if exists picks_one_live_game;
drop index if exists picks_one_open_game;
drop index if exists picks_official_key_live;
drop index if exists picks_official_key_uidx;
create unique index if not exists picks_auto_open_game_ledger on picks(ledger, game_id)
  where pick_source = 'auto' and status in ('queued','posting','posted','delivery_unknown');
create unique index if not exists picks_official_ledger_key_uidx on picks(ledger, official_key) where official_key is not null;

-- Existing ambiguous sends are retained permanently, not recyclable candidates.
update picks set status = 'delivery_unknown'
where status = 'skipped' and skip_reason ilike '%send uncertain%';

-- Preserve immutable confirmed tickets and their public results even through operator APIs.
create or replace function protect_confirmed_ticket() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.status in ('posted','graded','delivery_unknown') then
      raise exception 'Official history cannot be deleted';
    end if;
    return OLD;
  end if;
  if OLD.status in ('posted','graded','delivery_unknown') then
    if (NEW.selection, NEW.market, NEW.side, NEW.locked_odds, NEW.locked_line,
        NEW.units, NEW.model_probability, NEW.model_version, NEW.model_edge,
        NEW.edge_pct, NEW.freeze_json, NEW.posted_at, NEW.ledger, NEW.pick_source, NEW.game_id, NEW.start_at, NEW.league, NEW.sport, NEW.matchup, NEW.official_key, NEW.confidence, NEW.locked_odds_json, NEW.line_source)
       is distinct from
       (OLD.selection, OLD.market, OLD.side, OLD.locked_odds, OLD.locked_line,
        OLD.units, OLD.model_probability, OLD.model_version, OLD.model_edge,
        OLD.edge_pct, OLD.freeze_json, OLD.posted_at, OLD.ledger, OLD.pick_source, OLD.game_id, OLD.start_at, OLD.league, OLD.sport, OLD.matchup, OLD.official_key, OLD.confidence, OLD.locked_odds_json, OLD.line_source) then
      raise exception 'Confirmed ticket is immutable';
    end if;
    if OLD.status = 'graded' and (NEW.result, NEW.profit_units, NEW.graded_at, NEW.status, NEW.settlement_evidence)
       is distinct from (OLD.result, OLD.profit_units, OLD.graded_at, OLD.status, OLD.settlement_evidence) then
      raise exception 'Confirmed result is immutable';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;
drop trigger if exists protect_confirmed_ticket on picks;
create trigger protect_confirmed_ticket before update or delete on picks
for each row execute function protect_confirmed_ticket();
