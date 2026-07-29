-- Geometry Dash Map Roulette simple save table
-- This stores only uuid(session_id) and the chosen map name.

create extension if not exists pgcrypto;

create table if not exists public.roulette_recommendations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  map_name text not null
);

create index if not exists roulette_recommendations_created_at_idx
  on public.roulette_recommendations (created_at desc);

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
      and policyname = 'service_role_insert_only'
  ) then
    create policy "service_role_insert_only"
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
      and policyname = 'service_role_select_only'
  ) then
    create policy "service_role_select_only"
      on public.roulette_recommendations
      for select
      to service_role
      using (true);
  end if;
end $$;

comment on table public.roulette_recommendations is
  'Stores roulette result session id and chosen map name only.';
