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

create table if not exists auth_users (
  id text primary key,
  provider text not null,
  provider_user_id text not null,
  nickname text,
  email text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (provider, provider_user_id)
);

create table if not exists manual_saves (
  game_id text primary key,
  owner_id text references auth_users(id) on delete set null,
  saved_at timestamptz not null,
  state_payload jsonb not null,
  world_payload jsonb not null
);

alter table manual_saves
  add column if not exists owner_id text references auth_users(id) on delete set null;

create unique index if not exists manual_saves_owner_id_unique
  on manual_saves(owner_id)
  where owner_id is not null;

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
