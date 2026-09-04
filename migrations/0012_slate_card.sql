-- Board-wide daily card: best N games, not one ticket per sport.
drop index if exists picks_one_live_sport;

create unique index if not exists picks_one_open_game
  on picks (game_id)
  where status in ('queued', 'posting', 'posted') and result is null;

drop index if exists picks_official_key_uidx;
create unique index if not exists picks_official_key_live
  on picks (official_key)
  where official_key is not null and status in ('queued', 'posting', 'posted') and result is null;
