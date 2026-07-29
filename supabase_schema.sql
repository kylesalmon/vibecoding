-- Geometry Dash Map Roulette simple save table
-- Version 1: drop the old table and recreate it cleanly.

drop table if exists public.roulette_recommendations cascade;

create extension if not exists pgcrypto;

create table public.roulette_recommendations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  map_name text not null
);

create index roulette_recommendations_created_at_idx
  on public.roulette_recommendations (created_at desc);

create index roulette_recommendations_session_id_idx
  on public.roulette_recommendations (session_id);

alter table public.roulette_recommendations enable row level security;

create policy "service_role_insert_only"
  on public.roulette_recommendations
  for insert
  to service_role
  with check (true);

create policy "service_role_select_only"
  on public.roulette_recommendations
  for select
  to service_role
  using (true);

comment on table public.roulette_recommendations is
  'Stores roulette result session id and chosen map name only.';
