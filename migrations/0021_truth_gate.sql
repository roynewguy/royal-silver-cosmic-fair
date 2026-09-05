alter table picks add column if not exists context_json text;
alter table desk_meta add column if not exists truth_json text default '{}';
