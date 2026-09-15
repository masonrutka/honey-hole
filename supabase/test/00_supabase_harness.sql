-- Reproduce the parts of a Supabase project the schema depends on.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Supabase's auth.uid() reads the JWT claim. Ours reads a session setting we
-- can flip, which is the same thing for the purpose of exercising policies.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- This is the crucial fidelity detail: Supabase grants ALL on public tables to
-- anon and authenticated by default, which is exactly why a table-level grant
-- has to be revoked before per-column INSERT grants can mean anything.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
