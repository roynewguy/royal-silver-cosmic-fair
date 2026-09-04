alter table picks add column if not exists model_version text;
alter table picks add column if not exists model_probability double precision;
alter table picks add column if not exists model_edge double precision;
alter table picks add column if not exists freeze_json text;
