alter table desk_meta add column if not exists daily_picks_source text not null default 'env';
