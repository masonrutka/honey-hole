-- Honey Hole — the writable layer.
--
-- Run this once in the Supabase SQL editor. It is written to be re-runnable:
-- every statement is idempotent, so pasting it again after an edit is safe.
--
-- The guiding rule throughout: the database, not the application, decides who
-- may read and write what. Row Level Security is on for every table, and the
-- anon key shipped to browsers can do nothing these policies do not allow.

-- ---------------------------------------------------------------------------
-- profiles — public identity, one row per account
-- ---------------------------------------------------------------------------
-- auth.users is managed by Supabase and holds the email. It is never exposed.
-- Anything other people can see about a user lives here instead, so there is
-- no way to leak an email address by selecting the wrong column.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null
              check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (length(display_name) <= 40),
  home_wbic   integer,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public"
  on public.profiles for select
  using (true);

drop policy if exists "users insert their own profile" on public.profiles;
create policy "users insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- water_reports — what the water was actually doing
-- ---------------------------------------------------------------------------
-- The app's weakest number is surface temperature: it is estimated from a
-- seven-day mean air temperature because USGS gauges cover rivers, not inland
-- lakes. One real reading from someone standing on the lake beats the estimate
-- outright, which is why this is the first thing users are allowed to write.

create table if not exists public.water_reports (
  id             uuid primary key default gen_random_uuid(),
  -- Points at profiles, not auth.users, even though the ids are the same value.
  -- PostgREST can only embed a related row across a declared foreign key, and
  -- the report feed needs to show who wrote each report. profiles.id is itself
  -- a reference to auth.users, so deleting an account still cascades to here.
  user_id        uuid not null references public.profiles (id) on delete cascade,
  wbic           integer not null,
  observed_at    timestamptz not null,
  surface_temp_f numeric(4,1) check (surface_temp_f between 32 and 100),
  clarity        text check (clarity in ('clear', 'stained', 'murky')),
  water_level    text check (water_level in ('low', 'normal', 'high')),
  activity       text check (activity in ('hot', 'steady', 'slow', 'dead')),
  note           text check (length(note) <= 280),
  created_at     timestamptz not null default now(),
  -- Moderation is a nullable timestamp rather than a delete: hiding something
  -- should be reversible, and a hard delete loses the evidence of why.
  hidden_at      timestamptz,
  hidden_reason  text,

  -- A report with no observations in it is noise.
  constraint report_says_something check (
    surface_temp_f is not null or clarity is not null
    or water_level is not null or activity is not null
    or (note is not null and length(trim(note)) > 0)
  ),
  -- Nobody can report the future, and a reading from last month is not a
  -- condition report. Both bounds are enforced here rather than in the form,
  -- because the form is not the only thing that can reach this table.
  constraint report_is_recent check (
    observed_at <= now() + interval '1 hour'
    and observed_at >= now() - interval '14 days'
  )
);

create index if not exists water_reports_lake_idx
  on public.water_reports (wbic, observed_at desc)
  where hidden_at is null;

create index if not exists water_reports_author_idx
  on public.water_reports (user_id, created_at desc);

alter table public.water_reports enable row level security;

drop policy if exists "visible reports are public" on public.water_reports;
create policy "visible reports are public"
  on public.water_reports for select
  using (hidden_at is null or auth.uid() = user_id);

drop policy if exists "signed in users write their own reports" on public.water_reports;
create policy "signed in users write their own reports"
  on public.water_reports for insert
  with check (
    auth.uid() = user_id
    -- Rate limit in the database, where it cannot be bypassed by calling the
    -- API directly. Ten a day per person is far above honest use and far
    -- below what makes spam worth anyone's time.
    and (
      select count(*) from public.water_reports r
      where r.user_id = auth.uid()
        and r.created_at > now() - interval '24 hours'
    ) < 10
  );

drop policy if exists "users edit their own reports" on public.water_reports;
create policy "users edit their own reports"
  on public.water_reports for update
  using (auth.uid() = user_id and hidden_at is null)
  with check (auth.uid() = user_id);

drop policy if exists "users delete their own reports" on public.water_reports;
create policy "users delete their own reports"
  on public.water_reports for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- feedback — "tell me what is wrong with this app"
-- ---------------------------------------------------------------------------
-- Write-only from the app's point of view. There is deliberately no select
-- policy, so even a signed-in user cannot read anyone's feedback, including
-- their own. It is read in the Supabase dashboard and mailed out by the server.

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  email      text check (email is null or length(email) <= 254),
  message    text not null check (length(trim(message)) between 1 and 2000),
  path       text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "anyone may send feedback" on public.feedback;
create policy "anyone may send feedback"
  on public.feedback for insert
  with check (
    -- Anonymous feedback is allowed; claiming to be someone else is not.
    (user_id is null or auth.uid() = user_id)
  );

-- ---------------------------------------------------------------------------
-- Aggregates
-- ---------------------------------------------------------------------------
-- The lake page needs "the most recent temperature reading, if it is recent
-- enough to mean anything". Doing that in SQL keeps it one round trip and lets
-- the freshness rule live next to the data it describes.

create or replace function public.latest_water_report(lake_wbic integer)
returns table (
  observed_at    timestamptz,
  surface_temp_f numeric(4,1),
  clarity        text,
  water_level    text,
  report_count   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with recent as (
    select * from public.water_reports
    where wbic = lake_wbic
      and hidden_at is null
      and observed_at > now() - interval '7 days'
  )
  select
    (select r.observed_at from recent r
      where r.surface_temp_f is not null order by r.observed_at desc limit 1),
    (select r.surface_temp_f from recent r
      where r.surface_temp_f is not null order by r.observed_at desc limit 1),
    (select r.clarity from recent r
      where r.clarity is not null order by r.observed_at desc limit 1),
    (select r.water_level from recent r
      where r.water_level is not null order by r.observed_at desc limit 1),
    (select count(*) from recent);
$$;

-- ---------------------------------------------------------------------------
-- Profile creation
-- ---------------------------------------------------------------------------
-- Every account needs a profile row. Doing it in a trigger rather than from the
-- app means it cannot be skipped, cannot race two browser tabs against each
-- other, and works identically whether somebody signed in with Google or with
-- an emailed link.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base     text;
  attempt  text;
  suffix   integer := 0;
begin
  -- Prefer the name Google gave us, fall back to the email's local part, and
  -- fall back again to a generic handle for an address that is all symbols.
  base := lower(coalesce(
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'name', ''), '[^A-Za-z0-9_]', '', 'g'), ''),
    nullif(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g'), ''),
    'anglr'
  ));

  -- The username check constraint demands 3 to 20 characters.
  base := substr(base, 1, 16);
  if length(base) < 3 then
    base := base || 'fsh';
  end if;

  attempt := base;
  while exists (select 1 from public.profiles p where p.username = attempt) loop
    suffix := suffix + 1;
    attempt := substr(base, 1, 16) || suffix::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    attempt,
    nullif(new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
