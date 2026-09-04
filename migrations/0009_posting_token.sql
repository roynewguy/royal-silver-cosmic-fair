alter table picks add column if not exists posting_started_at timestamptz;
alter table picks add column if not exists posting_token text;

update picks
set posting_started_at = posting_at
where posting_started_at is null and posting_at is not null;
