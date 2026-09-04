alter table desk_meta add column if not exists operator_pin_hash text;

alter table picks add column if not exists official_key text;
alter table picks add column if not exists discord_message_id text;

create unique index if not exists picks_official_key_uidx
  on picks (official_key)
  where official_key is not null;

create table if not exists desk_sessions (
  token text primary key,
  expires_at timestamptz not null
);

create index if not exists desk_sessions_exp_idx on desk_sessions (expires_at);
