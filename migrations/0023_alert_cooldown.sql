alter table desk_meta add column if not exists alert_json text not null default '{}';
