alter table desk_meta add column if not exists last_tick_at timestamptz;
alter table desk_meta add column if not exists last_tick_source text;
