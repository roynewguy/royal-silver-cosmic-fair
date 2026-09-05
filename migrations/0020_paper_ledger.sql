alter table picks add column if not exists ledger text not null default 'official';
create index if not exists picks_ledger_idx on picks (ledger, status);

create table if not exists paper_replay_runs (
  id bigserial primary key,
  replay_date text not null,
  generated_at timestamptz not null default now(),
  report_json text not null,
  official boolean not null default false
);
