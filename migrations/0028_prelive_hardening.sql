-- Pre-live hardening: soak tickets, grade snapshots, freeze CLV after grade.
-- Additive only. Never deletes historical warehouse or pick rows.

create table if not exists soak_tickets (
  id bigserial primary key,
  captured_at timestamptz not null default now(),
  game_id text not null,
  league text not null,
  market text not null,
  selection text not null,
  side text not null,
  locked_line double precision,
  posted_price integer not null,
  posted_at timestamptz,
  sportsbook text not null,
  opposing_price integer,
  model_version text not null,
  model_probability double precision,
  no_vig_probability double precision,
  edge_pct double precision,
  expected_value_pct double precision,
  data_quality double precision,
  confidence integer,
  freeze_json text,
  closing_price integer,
  close_at timestamptz,
  clv double precision,
  grade_outcome text,
  would_have_posted boolean not null default true,
  skip_reason text,
  pick_id integer
);
create index if not exists soak_tickets_game_idx on soak_tickets (game_id, captured_at desc);
create index if not exists soak_tickets_captured_idx on soak_tickets (captured_at desc);

alter table picks add column if not exists grade_snapshot_json text;

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
    if OLD.status = 'graded' and (NEW.result, NEW.profit_units, NEW.graded_at, NEW.status, NEW.settlement_evidence, NEW.clv, NEW.closing_odds, NEW.closing_snapshot_json, NEW.grade_snapshot_json)
       is distinct from (OLD.result, OLD.profit_units, OLD.graded_at, OLD.status, OLD.settlement_evidence, OLD.clv, OLD.closing_odds, OLD.closing_snapshot_json, OLD.grade_snapshot_json) then
      raise exception 'Confirmed result is immutable';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;
drop trigger if exists protect_confirmed_ticket on picks;
create trigger protect_confirmed_ticket before update or delete on picks
for each row execute function protect_confirmed_ticket();
