-- Customer memberships. Whop will own billing later; this table is the
-- entitlement record the app reads. No Stripe. No auto-grant.
create table if not exists memberships (
  user_id text primary key,
  provider text not null default 'none',
  status text not null default 'none',
  plan_id text,
  external_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memberships_provider_status_idx
  on memberships (provider, status);
