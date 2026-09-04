alter table desk_meta add column if not exists auth_fail_count integer not null default 0;
alter table desk_meta add column if not exists auth_locked_until timestamptz;

create table if not exists operator_attempts (
  id serial primary key,
  ip_hash text not null,
  ok boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists operator_attempts_ip_time_idx
  on operator_attempts (ip_hash, attempted_at desc);
