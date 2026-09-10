-- Soak identity + immutable would-post freeze. Additive.

alter table soak_tickets add column if not exists soak_key text;

update soak_tickets
set soak_key = coalesce(
  soak_key,
  to_char(coalesce(posted_at, captured_at) at time zone 'America/Los_Angeles', 'YYYY-MM-DD')
    || ':' || league || ':' || game_id || ':' || market || ':' || selection || ':' || model_version || ':soak'
)
where soak_key is null;

delete from soak_tickets a using soak_tickets b
where a.soak_key = b.soak_key and a.id > b.id;

alter table soak_tickets alter column soak_key set not null;
alter table soak_tickets alter column posted_price drop not null;

create unique index if not exists soak_tickets_soak_key_uq on soak_tickets (soak_key);

create or replace function protect_soak_would_post() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.would_have_posted = true then
      raise exception 'Soak would-post ticket cannot be deleted';
    end if;
    return OLD;
  end if;
  if OLD.would_have_posted = true then
    if NEW.posted_price is distinct from OLD.posted_price
       or NEW.freeze_json is distinct from OLD.freeze_json
       or NEW.would_have_posted is distinct from true
       or NEW.locked_line is distinct from OLD.locked_line
       or NEW.sportsbook is distinct from OLD.sportsbook
       or NEW.opposing_price is distinct from OLD.opposing_price then
      raise exception 'Soak would-post freeze is immutable';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists protect_soak_would_post on soak_tickets;
create trigger protect_soak_would_post before update or delete on soak_tickets
for each row execute function protect_soak_would_post();
