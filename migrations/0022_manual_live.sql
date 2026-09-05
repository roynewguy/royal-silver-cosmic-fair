alter table picks add column if not exists pick_source text not null default 'auto';
alter table picks add column if not exists line_source text;
alter table picks add column if not exists posted_score text;
alter table picks add column if not exists posted_state text;
alter table picks add column if not exists needs_manual_grade boolean not null default false;
alter table picks add column if not exists manual_post_id text;
create unique index if not exists picks_manual_post_id_uidx on picks (manual_post_id) where manual_post_id is not null;
create index if not exists picks_source_idx on picks (pick_source, status);
