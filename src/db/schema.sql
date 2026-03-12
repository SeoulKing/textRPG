create table if not exists game_sessions (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  state_payload jsonb not null
);

create table if not exists world_instances (
  game_id text primary key references game_sessions(id) on delete cascade,
  world_payload jsonb not null
);

create table if not exists content_templates (
  kind text not null,
  template_id text not null,
  payload jsonb not null,
  primary key (kind, template_id)
);

create table if not exists action_logs (
  id bigserial primary key,
  game_id text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists generation_logs (
  id bigserial primary key,
  game_id text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null
);
