alter table desk_meta add column if not exists max_daily_picks integer not null default 3;
