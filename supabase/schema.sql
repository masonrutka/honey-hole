-- Honey Hole — the writable layer.
--
-- Run this once in the Supabase SQL editor. It is written to be re-runnable:
-- every statement is idempotent, so pasting it again after an edit is safe.
--
-- Two rules run through the whole file.
--
-- 1. The database, not the application, decides who may read and write what.
--    The key shipped to browsers can do nothing these policies allow it not to.
--
-- 2. No policy or constraint depends on the current time in a way that is
--    re-evaluated later. A CHECK constraint is re-run on every UPDATE and by
--    the COPY that pg_restore uses, so "observed_at is within 14 days" as a
--    CHECK would make old rows uneditable and, once there is a fortnight of
--    history, make backups impossible to restore. Time-dependent rules live in
--    BEFORE INSERT triggers, which run once and never again.

-- ---------------------------------------------------------------------------
-- profiles — public identity, one row per account
-- ---------------------------------------------------------------------------
-- auth.users is managed by Supabase and holds the email. It is never exposed.
-- Anything other people can see about a user lives here instead.

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
-- write_quota — how much someone has written today
-- ---------------------------------------------------------------------------
-- Counting existing rows inside an INSERT policy does not work as a rate
-- limit, for three separate reasons: the client can supply its own created_at
-- and hide rows from the counter, a multi-row INSERT evaluates every row
-- against the snapshot taken before the statement began (so one request can
-- insert any number of rows and each sees the old count), and concurrent
-- single-row inserts all read the count before any of them commits.
--
-- A counter row that is updated in place fixes all three: UPDATE takes a row
-- lock, so writers serialise, and each row of a multi-row insert sees the
-- increment from the row before it.
--
-- `subject` is a free-form key rather than a user id so the same table can
-- limit signed-in users, anonymous callers by address, and global spend.

create table if not exists public.write_quota (
  subject text not null,
  day     date not null,
  kind    text not null,
  n       integer not null default 0,
  primary key (subject, day, kind)
);

alter table public.write_quota enable row level security;
-- Deliberately no policies. Only the SECURITY DEFINER triggers below touch
-- this table; with RLS on and nothing granted, it is invisible to everyone
-- else, which is what stops somebody resetting their own counter.

/**
 * Add one to a counter and return the new value. Raises nothing itself --
 * callers decide what the limit is.
 */
create or replace function public.bump_quota(
  p_subject text,
  p_kind    text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  insert into public.write_quota (subject, day, kind, n)
  values (p_subject, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (subject, day, kind)
    do update set n = public.write_quota.n + 1
  returning n into used;
  return used;
end;
$$;

-- ---------------------------------------------------------------------------
-- water_reports — what the water was actually doing
-- ---------------------------------------------------------------------------
-- The app's weakest number is surface temperature: it is estimated from a
-- seven-day mean air temperature because USGS gauges cover rivers, not inland
-- lakes. One real reading from someone standing on the lake beats the estimate
-- outright, which is why this is the first thing users are allowed to write.

create table if not exists public.water_reports (
  id             uuid primary key default gen_random_uuid(),
  -- Points at profiles, not auth.users, even though the ids are the same
  -- value. PostgREST can only embed a related row across a declared foreign
  -- key, and the feed needs to show who wrote each report. profiles.id is
  -- itself a reference to auth.users, so deleting an account still cascades.
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

  -- A report with no observations in it is noise. Time-independent, so it is
  -- safe to re-evaluate on update and restore.
  constraint report_says_something check (
    surface_temp_f is not null or clarity is not null
    or water_level is not null or activity is not null
    or (note is not null and length(trim(note)) > 0)
  )
);

-- Note there is deliberately no CHECK on observed_at. See the header comment;
-- the freshness window is enforced in the trigger below instead.

create index if not exists water_reports_lake_idx
  on public.water_reports (wbic, observed_at desc)
  where hidden_at is null;

create index if not exists water_reports_author_idx
  on public.water_reports (user_id, created_at desc);

/**
 * Everything about a report that the client does not get to decide.
 *
 * BEFORE INSERT, so it runs exactly once per row and never again -- and so it
 * can overwrite the incoming values rather than merely rejecting them.
 */
create or replace function public.enforce_report_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  -- Server-owned columns. Row Level Security filters rows, it does not
  -- restrict columns, so without this a caller can post created_at = 2020 and
  -- make their rows invisible to any counter that looks at recent history.
  new.created_at    := now();
  new.hidden_at     := null;
  new.hidden_reason := null;

  if new.observed_at > now() + interval '1 hour' then
    raise exception 'observation is in the future' using errcode = 'HH002';
  end if;
  if new.observed_at < now() - interval '14 days' then
    raise exception 'observation is more than two weeks old' using errcode = 'HH002';
  end if;

  used := public.bump_quota('user:' || new.user_id::text, 'water_report');
  if used > 10 then
    raise exception 'daily report limit reached' using errcode = 'HH001';
  end if;

  return new;
end;
$$;

drop trigger if exists water_reports_rules on public.water_reports;
create trigger water_reports_rules
  before insert on public.water_reports
  for each row execute function public.enforce_report_rules();

alter table public.water_reports enable row level security;

drop policy if exists "visible reports are public" on public.water_reports;
create policy "visible reports are public"
  on public.water_reports for select
  using (hidden_at is null or auth.uid() = user_id);

drop policy if exists "signed in users write their own reports" on public.water_reports;
create policy "signed in users write their own reports"
  on public.water_reports for insert
  with check (auth.uid() = user_id);

-- The old policy counted recent rows here to cap the rate. It could not work;
-- see the write_quota comment. Dropped rather than left looking protective.
drop policy if exists "users edit their own reports" on public.water_reports;

drop policy if exists "users delete their own reports" on public.water_reports;
create policy "users delete their own reports"
  on public.water_reports for delete
  using (auth.uid() = user_id);

-- The app offers no way to edit a report -- only to post one or remove it --
-- so UPDATE is withdrawn entirely rather than left as surface to defend.
-- Moderation runs as the service role in the dashboard, which bypasses this.
revoke update on public.water_reports from anon, authenticated;

-- Postgres will not let a column-level revoke narrow a table-level grant, so
-- the table-level INSERT has to go and be re-granted per column. This is the
-- second line of defence behind the trigger, not a replacement for it.
revoke insert on public.water_reports from anon, authenticated;
grant insert (user_id, wbic, observed_at, surface_temp_f, clarity, water_level, activity, note)
  on public.water_reports to authenticated;

-- ---------------------------------------------------------------------------
-- feedback — "tell me what is wrong with this app"
-- ---------------------------------------------------------------------------
-- Write-only from the app's point of view. There is deliberately no select
-- policy, so even a signed-in user cannot read anyone's feedback, including
-- their own. It is read in the Supabase dashboard and mailed out by the server.

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  email      text check (email is null or length(email) <= 254),
  message    text not null check (length(trim(message)) between 1 and 2000),
  path       text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create or replace function public.enforce_feedback_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  new.created_at := now();

  -- Anonymous feedback is deliberately allowed: somebody who cannot work out
  -- how to sign in is exactly the person worth hearing from. That leaves no
  -- identity to meter, so anonymous submissions share one bucket. It is a
  -- blunt cap, and it is the difference between a flood costing you a dashboard
  -- clean-up and a flood costing you your Resend quota.
  used := public.bump_quota(
    case when new.user_id is null then 'anon' else 'user:' || new.user_id::text end,
    'feedback'
  );
  if used > (case when new.user_id is null then 200 else 20 end) then
    raise exception 'feedback limit reached' using errcode = 'HH001';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_rules on public.feedback;
create trigger feedback_rules
  before insert on public.feedback
  for each row execute function public.enforce_feedback_rules();

drop policy if exists "anyone may send feedback" on public.feedback;
create policy "anyone may send feedback"
  on public.feedback for insert
  -- Anonymous is fine; claiming to be somebody else is not.
  with check (user_id is null or auth.uid() = user_id);

revoke update, delete on public.feedback from anon, authenticated;
revoke insert on public.feedback from anon, authenticated;
grant insert (user_id, email, message, path) on public.feedback to anon, authenticated;

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
--
-- This runs AFTER INSERT on auth.users, so anything it raises rolls back the
-- signup itself. Every value it touches is therefore bounded to fit its column,
-- and the unique username is resolved by retrying rather than by looking first.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base    text;
  attempt text;
  suffix  integer := 0;
begin
  -- A Google display name is usable as a handle. An email local part is not:
  -- profiles is world-readable, so a username of "muskego28" on a table anyone
  -- can select republishes most of muskego28@gmail.com. Accounts created by
  -- emailed link get an opaque handle instead.
  base := lower(nullif(
    regexp_replace(coalesce(new.raw_user_meta_data ->> 'name', ''), '[^A-Za-z0-9_]', '', 'g'),
    ''
  ));

  if base is null or length(base) < 3 then
    base := 'angler' || substr(md5(new.id::text), 1, 6);
  end if;

  base    := substr(base, 1, 16);
  attempt := base;

  -- Checking whether a username is free and then inserting it are two separate
  -- statements, and two people called John Smith signing in at the same moment
  -- will both find "johnsmith" free. Let the unique index be the arbiter.
  loop
    begin
      insert into public.profiles (id, username, display_name)
      values (
        new.id,
        attempt,
        -- display_name is CHECK (length <= 40) and this value comes straight
        -- from the identity provider, where a 44-character name is ordinary.
        -- Untruncated, it raises, and the signup fails with nothing the person
        -- can do about it.
        left(nullif(new.raw_user_meta_data ->> 'name', ''), 40)
      );
      exit;
    exception
      when unique_violation then
        -- Same id twice means the profile already exists; nothing to do.
        if exists (select 1 from public.profiles p where p.id = new.id) then
          exit;
        end if;
        suffix  := suffix + 1;
        attempt := substr(base, 1, 16) || suffix::text;
        if suffix > 500 then
          -- Give up on a pretty handle rather than refusing the account.
          attempt := 'angler' || substr(md5(random()::text), 1, 10);
        end if;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
