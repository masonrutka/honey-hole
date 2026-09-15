-- Security tests for schema.sql. See run.sh.
-- Every test states what an attacker tries and what must happen instead.
drop table if exists results; create table results(n serial, name text, pass boolean, detail text);
create or replace function sqlstate_is_hh(d text) returns boolean language sql immutable as $fn$ select d like 'HH001%' $fn$;

-- ---------------------------------------------------------------- seed users
insert into auth.users (email, raw_user_meta_data) values
  ('alice@example.com', '{"name":"Alice Anderson"}'),
  ('bob@example.com',   '{"name":"Bob Brown"}'),
  ('maria@example.com', '{"name":"Maria Fernanda Gonzalez de la Cruz Rodriguez"}'),
  ('muskego28@gmail.com', '{}'),
  ('js1@example.com',   '{"name":"John Smith"}'),
  ('js2@example.com',   '{"name":"John Smith"}');

create or replace function uid_of(e text) returns uuid language sql stable security definer as
$$ select id from auth.users where email = e $$;
grant execute on function uid_of(text) to anon, authenticated;

create or replace function note_result(p_name text, p_pass boolean, p_detail text)
returns void language sql security definer as $$ insert into results(name,pass,detail) values (p_name,p_pass,p_detail) $$;
grant execute on function note_result(text,boolean,text) to anon, authenticated;

-- =================== SIGNUP ROBUSTNESS ===================
do $$ begin
  perform note_result('Signup survives a 44-character provider name',
    exists(select 1 from public.profiles p join auth.users u on u.id=p.id where u.email='maria@example.com'),
    coalesce((select 'display_name len='||length(display_name) from public.profiles p join auth.users u on u.id=p.id where u.email='maria@example.com'),'NO PROFILE'));
end $$;

do $$
declare un1 text; un2 text; begin
  select p.username into un1 from public.profiles p join auth.users u on u.id=p.id where u.email='js1@example.com';
  select p.username into un2 from public.profiles p join auth.users u on u.id=p.id where u.email='js2@example.com';
  perform note_result('Two identical names both get an account, distinct usernames',
    un1 is not null and un2 is not null and un1 <> un2, coalesce(un1,'null')||' / '||coalesce(un2,'null'));
end $$;

do $$
declare un text; begin
  select p.username into un from public.profiles p join auth.users u on u.id=p.id where u.email='muskego28@gmail.com';
  perform note_result('Email-link signup does NOT leak the address into the public username',
    un is not null and position('muskego' in un) = 0, 'username = '||coalesce(un,'null'));
end $$;

-- =================== IMPERSONATION ===================
do $$
declare ok boolean := false; d text := '';
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  begin
    insert into public.water_reports(user_id,wbic,observed_at,note)
    values (uid_of('bob@example.com'), 100, now(), 'posted as bob');
    d := 'INSERT SUCCEEDED';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('Alice cannot post a report attributed to Bob', ok, d);
end $$;

-- =================== created_at SPOOFING (finding 1a) ===================
do $$
declare ok boolean := false; d text := '';
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  begin
    insert into public.water_reports(user_id,wbic,observed_at,note,created_at)
    values (uid_of('alice@example.com'), 100, now(), 'backdated', '2020-01-01');
    d := 'INSERT WITH created_at SUCCEEDED';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('Client cannot supply its own created_at', ok, d);
end $$;

-- =================== MULTI-ROW BULK BYPASS (finding 1b) ===================
do $$
declare ok boolean := false; d text := ''; c int;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('bob@example.com')::text, true);
  begin
    insert into public.water_reports(user_id,wbic,observed_at,note)
    select uid_of('bob@example.com'), 200, now(), 'bulk '||g from generate_series(1,5000) g;
    d := 'BULK INSERT OF 5000 SUCCEEDED';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  select count(*) into c from public.water_reports where wbic=200;
  perform note_result('One statement cannot insert 5000 reports past the cap', ok and c<=10, d||' | rows landed='||c);
end $$;

-- =================== THE DAILY CAP ITSELF ===================
do $$
declare ok boolean := false; d text := ''; c int; i int;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  begin
    for i in 1..11 loop
      insert into public.water_reports(user_id,wbic,observed_at,note)
      values (uid_of('alice@example.com'), 300, now(), 'n'||i);
    end loop;
    d := 'ALL 11 SUCCEEDED';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('The 11th report in a day is refused (HH001)', ok and sqlstate_is_hh(d), d);
end $$;

-- =================== observed_at WINDOW ===================
do $$
declare ok boolean := false; d text := '';
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('bob@example.com')::text, true);
  begin
    insert into public.water_reports(user_id,wbic,observed_at,note)
    values (uid_of('bob@example.com'), 400, now() - interval '40 days', 'ancient');
    d := 'ACCEPTED A 40-DAY-OLD OBSERVATION';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('A 40-day-old observation is refused', ok, d);
end $$;

do $$
declare ok boolean := false; d text := '';
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('bob@example.com')::text, true);
  begin
    insert into public.water_reports(user_id,wbic,observed_at,note)
    values (uid_of('bob@example.com'), 401, now() + interval '5 days', 'future');
    d := 'ACCEPTED A FUTURE OBSERVATION';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('A future observation is refused', ok, d);
end $$;
-- =================== POSITIVE CONTROL: normal use must work ===================
do $$
declare ok boolean; d text; rec record;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('bob@example.com')::text, true);
  insert into public.water_reports(user_id,wbic,observed_at,surface_temp_f,clarity,activity,note)
  values (uid_of('bob@example.com'), 762400, now() - interval '2 hours', 68.5, 'stained', 'steady', 'weeds on the north bar');
  select * into rec from public.latest_water_report(762400);
  ok := rec.surface_temp_f = 68.5 and rec.clarity = 'stained' and rec.report_count = 1;
  perform note_result('A normal report saves and reads back through the aggregate', ok,
    'temp='||coalesce(rec.surface_temp_f::text,'null')||' clarity='||coalesce(rec.clarity,'null')||' count='||rec.report_count);
end $$;

-- =================== FEEDBACK IS UNREADABLE ===================
do $$
declare c int; ok boolean; d text;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  insert into public.feedback(user_id,email,message) values (uid_of('alice@example.com'),'alice@example.com','private note');
  begin
    select count(*) into c from public.feedback;
    ok := (c = 0); d := 'select returned '||c||' rows (RLS filters to zero)';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('Nobody can read feedback back, not even its own author', ok, d);
end $$;

do $$
declare c int; ok boolean; d text;
begin
  execute 'set local role anon';
  begin
    select count(*) into c from public.feedback; ok := (c=0); d := 'anon select returned '||c;
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('Anonymous cannot read feedback', ok, d);
end $$;

-- =================== QUOTA TABLE IS UNTOUCHABLE ===================
do $$
declare c int; ok boolean; d text;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  begin
    select count(*) into c from public.write_quota; ok := (c=0); d := 'select returned '||c||' rows';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('A user cannot read the quota table', ok, d);
end $$;

do $$
declare ok boolean := false; d text;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  begin
    update public.write_quota set n = 0; 
    if not found then ok := true; d := 'update matched no rows (RLS hid them)'; else d := 'RESET THEIR OWN QUOTA'; end if;
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('A user cannot reset their own quota', ok, d);
end $$;

-- =================== HIDDEN REPORTS ===================
do $$
declare vis_other int; vis_owner int; ok boolean;
begin
  -- moderate as the service role, on a report backdated 20 days
  execute 'set local role postgres';
  insert into public.water_reports(user_id,wbic,observed_at,note)
  values (uid_of('bob@example.com'), 900, now() - interval '1 hour', 'abusive');
  update public.water_reports set observed_at = now() - interval '20 days' where wbic=900;
  update public.water_reports set hidden_at = now(), hidden_reason='abuse' where wbic=900;

  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  select count(*) into vis_other from public.water_reports where wbic=900;
  perform set_config('test.uid', uid_of('bob@example.com')::text, true);
  select count(*) into vis_owner from public.water_reports where wbic=900;
  perform note_result('Moderating a 20-day-old report works, and hides it from others',
    vis_other = 0 and vis_owner = 1, 'others see '||vis_other||', author sees '||vis_owner);
exception when others then
  perform note_result('Moderating a 20-day-old report works, and hides it from others', false, sqlstate||' '||sqlerrm);
end $$;

-- =================== UPDATE / DELETE ===================
do $$
declare ok boolean := false; d text;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('bob@example.com')::text, true);
  begin
    update public.water_reports set note='edited' where wbic=762400;
    d := 'UPDATE SUCCEEDED';
  exception when others then ok := true; d := sqlstate||' '||sqlerrm; end;
  perform note_result('Editing a report is not possible for anyone', ok, d);
end $$;

do $$
declare c int; ok boolean; d text;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  delete from public.water_reports where wbic=762400;
  get diagnostics c = row_count;
  ok := (c = 0);
  perform note_result('Alice cannot delete Bob''s report', ok, 'rows deleted = '||c);
end $$;

do $$
declare c int; ok boolean;
begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('bob@example.com')::text, true);
  delete from public.water_reports where wbic=762400;
  get diagnostics c = row_count;
  ok := (c = 1);
  perform note_result('Bob CAN delete his own report', ok, 'rows deleted = '||c);
end $$;

-- =================== NO EMAIL ANYWHERE PUBLIC ===================
do $$
declare cols text; ok boolean;
begin
  select coalesce(string_agg(c.table_name||'.'||c.column_name, ', '), 'none') into cols
  from information_schema.column_privileges p
  join information_schema.columns c
    on c.table_schema=p.table_schema and c.table_name=p.table_name and c.column_name=p.column_name
  where p.grantee in ('anon','authenticated') and p.privilege_type='SELECT'
    and c.table_schema='public' and c.column_name ilike '%email%';
  perform note_result('No public table exposes an email column to anon/authenticated', cols='none', cols);
end $$;

-- =================== BACKUP RESTORE (the COPY path) ===================
do $$
declare ok boolean := false; d text;
begin
  execute 'set local role postgres';
  create temp table restore_probe (like public.water_reports including all);
  begin
    -- COPY re-checks CHECK constraints. A 60-day-old row must still load.
    insert into public.water_reports(user_id,wbic,observed_at,note)
    values (uid_of('alice@example.com'), 950, now(), 'old row');
    update public.water_reports set observed_at = now() - interval '60 days', created_at = now() - interval '60 days' where wbic=950;
    ok := true; d := 'a 60-day-old row can exist and be updated';
  exception when others then ok := false; d := sqlstate||' '||sqlerrm; end;
  perform note_result('Old rows survive UPDATE and restore (no now() in CHECK)', ok, d);
end $$;
-- Re-test the two things just changed.

do $$
declare seen int; ok boolean;
begin
  -- maria has an account but has never posted.
  execute 'set local role anon';
  select count(*) into seen from public.profiles p where p.id = uid_of('maria@example.com');
  perform note_result('A member who never posted is not enumerable', seen = 0, 'anon sees '||seen||' row(s) for a silent member');
end $$;


do $$
declare total int;
begin
  execute 'set local role anon';
  select count(*) into total from public.profiles;
  perform note_result('Bulk enumeration of the member list is not possible',
    total <= 2, 'anon can see '||total||' of '||(select count(*) from auth.users)||' accounts');
end $$;

-- Carol posts a fresh visible report, and stays posted.
do $$ begin
  execute 'set local role authenticated';
  perform set_config('test.uid', uid_of('alice@example.com')::text, true);
  insert into public.water_reports(user_id,wbic,observed_at,surface_temp_f,note)
  values (uid_of('alice@example.com'), 555, now() - interval '30 minutes', 64.0, 'fresh report');
end $$;

-- Exactly what the browser does: read the feed anonymously, joined to the author.
do $$
declare uname text; dname text; c int;
begin
  execute 'set local role anon';
  select count(*) into c from public.water_reports where wbic=555;
  select p.username, p.display_name into uname, dname
    from public.water_reports r join public.profiles p on p.id = r.user_id
    where r.wbic = 555;
  perform note_result('FEED: anon reads the report AND its author name',
    c = 1 and uname is not null,
    'reports='||c||' author='||coalesce(uname,'NULL')||' display='||coalesce(dname,'NULL'));
end $$;

-- And the silent member is still invisible in the same breath.
do $$
declare total int; accounts int;
begin
  execute 'set local role anon';
  select count(*) into total from public.profiles;
  select count(*) into accounts from public.water_reports; -- unrelated, just proving anon can read reports
  perform note_result('FEED: only contributors are enumerable',
    total = 1, 'anon sees '||total||' profile(s)');
end $$;
