create table if not exists research_shadow (
  id bigserial primary key,
  game_id text not null,
  model_version text not null,
  kind text not null,
  generated_at timestamptz not null default now(),
  market text not null default 'moneyline',
  side text not null default 'home',
  probability double precision not null,
  market_probability double precision,
  estimated_edge double precision,
  market_price integer,
  features_json text not null default '{}',
  result text,
  closing_price integer,
  closing_implied double precision,
  clv double precision,
  brier double precision,
  official boolean not null default false
);

create index if not exists research_shadow_game_idx on research_shadow (game_id, model_version, generated_at);
create unique index if not exists research_shadow_canonical_idx on research_shadow (game_id, model_version) where kind = 'canonical';
