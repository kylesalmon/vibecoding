-- Geometry Dash Map Roulette recommendation storage
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.roulette_recommendations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  mode_key text not null,
  mode_label text not null,
  map_name text not null,
  map_rank integer,
  map_tier text,
  source_name text,
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists roulette_recommendations_created_at_idx
  on public.roulette_recommendations (created_at desc);

create index if not exists roulette_recommendations_mode_key_idx
  on public.roulette_recommendations (mode_key);

create index if not exists roulette_recommendations_session_id_idx
  on public.roulette_recommendations (session_id);

alter table public.roulette_recommendations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'roulette_recommendations'
      and policyname = 'allow insert from service role'
  ) then
    create policy "allow insert from service role"
      on public.roulette_recommendations
      for insert
      to service_role
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'roulette_recommendations'
      and policyname = 'allow select from service role'
  ) then
    create policy "allow select from service role"
      on public.roulette_recommendations
      for select
      to service_role
      using (true);
  end if;
end $$;

comment on table public.roulette_recommendations is
  'Stores Geometry Dash roulette results and metadata.';
