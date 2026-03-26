create extension if not exists pgcrypto;

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  scenario_id text not null,
  target_url text not null,
  goal text not null,
  status text not null,
  agent_count integer not null,
  storage_mode text not null,
  execution_mode text not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references runs(run_id) on delete cascade,
  agent_id text not null,
  archetype text not null,
  status text not null,
  seed text,
  frustration_score numeric not null,
  confidence_score numeric not null,
  exit_reason text,
  steps_completed integer not null,
  summary text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references runs(run_id) on delete cascade,
  agent_id text not null,
  step_index integer not null,
  action_kind text not null,
  action_ok boolean not null,
  decision_kind text not null,
  load_state text not null,
  page_url text not null,
  note text not null,
  frustration numeric not null,
  confidence numeric not null,
  occurred_at timestamptz not null
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique references runs(run_id) on delete cascade,
  title text not null,
  summary text not null,
  report_json jsonb not null,
  generated_at timestamptz not null default timezone('utc', now())
);

create index if not exists agents_run_id_idx on agents(run_id);
create index if not exists events_run_id_idx on events(run_id);
create index if not exists reports_run_id_idx on reports(run_id);
