-- Auto-post webhook + one live ticket per game/sport.
alter table desk_meta add column if not exists discord_webhook text;
alter table desk_meta add column if not exists auto_run boolean not null default true;
alter table desk_meta add column if not exists worker_lock_until timestamptz;

create unique index if not exists picks_one_live_game
  on picks (game_id)
  where status in ('queued', 'posted') and result is null;

create unique index if not exists picks_one_live_sport
  on picks (sport)
  where status in ('queued', 'posted') and result is null;
