-- CARBengine role and dashboard-module access setup.
-- Run this in Supabase Dashboard → SQL Editor after the three tables exist.
-- Add the first admin profile separately after creating that account in Auth.

alter table public.user_profiles add column if not exists email text;

create or replace function public.create_student_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, email, role, active, department)
  values (
    new.id,
    new.email,
    'student',
    true,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'department', '')), 80), '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        department = coalesce(excluded.department, public.user_profiles.department);
  return new;
end;
$$;
revoke all on function public.create_student_profile_for_new_auth_user() from public;
drop trigger if exists create_student_profile_after_signup on auth.users;
create trigger create_student_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_student_profile_for_new_auth_user();

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.active = true
  );
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.active = true
      and p.role = 'admin'
  );
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.user_profiles p
  where p.user_id = auth.uid()
    and p.active = true
  limit 1;
$$;

revoke all on function public.is_active_app_user() from public;
revoke all on function public.is_app_admin() from public;
revoke all on function public.current_app_role() from public;
grant execute on function public.is_active_app_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.has_module_access(requested_module_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dashboard_modules m
    where m.module_key = requested_module_key
      and m.enabled = true
      and public.is_active_app_user()
      and (
        public.is_app_admin()
        or exists (
          select 1
          from public.role_module_permissions p
          where p.role = public.current_app_role()
            and p.module_key = requested_module_key
            and p.access_level <> 'none'
        )
      )
  );
$$;
revoke all on function public.has_module_access(text) from public;
grant execute on function public.has_module_access(text) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.dashboard_modules enable row level security;
alter table public.role_module_permissions enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.sensor_devices enable row level security;

revoke all on public.user_profiles from anon;
revoke all on public.dashboard_modules from anon;
revoke all on public.role_module_permissions from anon;

grant select, insert, update on public.user_profiles to authenticated;
grant select, update on public.dashboard_modules to authenticated;
grant select, insert, update, delete on public.role_module_permissions to authenticated;
grant select on public.sensor_readings to authenticated;
grant insert on public.sensor_readings to anon, authenticated;
grant select on public.sensor_devices to authenticated;
revoke select, update, delete on public.sensor_readings from anon;
revoke update, delete on public.sensor_readings from authenticated;
revoke all on public.sensor_devices from anon;

drop policy if exists "active users read own profile and admins read all" on public.user_profiles;
create policy "active users read own profile and admins read all"
  on public.user_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

drop policy if exists "admins create profiles" on public.user_profiles;
create policy "admins create profiles"
  on public.user_profiles for insert to authenticated
  with check (public.is_app_admin());

drop policy if exists "admins update profiles" on public.user_profiles;
create policy "admins update profiles"
  on public.user_profiles for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "active users read dashboard modules" on public.dashboard_modules;
create policy "active users read dashboard modules"
  on public.dashboard_modules for select to authenticated
  using (public.is_active_app_user());

drop policy if exists "admins update dashboard modules" on public.dashboard_modules;
create policy "admins update dashboard modules"
  on public.dashboard_modules for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "users read own role permissions and admins read all" on public.role_module_permissions;
create policy "users read own role permissions and admins read all"
  on public.role_module_permissions for select to authenticated
  using (role = public.current_app_role() or public.is_app_admin());

drop policy if exists "admins manage role permissions" on public.role_module_permissions;
create policy "admins manage role permissions"
  on public.role_module_permissions for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "active role users read live telemetry" on public.sensor_readings;
create policy "active role users read live telemetry"
  on public.sensor_readings for select to authenticated
  using (
    public.has_module_access('live')
    or public.has_module_access('insights')
    or public.has_module_access('costs')
    or public.has_module_access('device')
    or public.has_module_access('anomaly')
  );

-- The PZEM uploader currently uses the public Supabase key. This keeps
-- ingestion working while restricting reading access to signed-in roles.
-- Replace this with a device-authenticated Edge Function for stronger upload
-- integrity; a public key cannot prove that an insert came from the ESP32.
drop policy if exists "device uploader inserts readings" on public.sensor_readings;
create policy "device uploader inserts readings"
  on public.sensor_readings for insert to anon, authenticated
  with check (device_id is not null and length(btrim(device_id)) > 0);

drop policy if exists "authorized users read sensor devices" on public.sensor_devices;
create policy "authorized users read sensor devices"
  on public.sensor_devices for select to authenticated
  using (public.has_module_access('device') or public.has_module_access('live'));

-- Suggested initial least-access defaults. Admins can change them in the app.
-- Existing rows are preserved so rerunning this file does not overwrite choices.
insert into public.role_module_permissions (role, module_key, access_level)
select d.role, m.module_key, d.access_level
from (values
  ('student', 'live', 'view'),
  ('student', 'insights', 'view'),
  ('student', 'goals', 'view'),
  ('student', 'travel', 'view'),
  ('faculty', 'live', 'view'),
  ('faculty', 'insights', 'view'),
  ('faculty', 'costs', 'view'),
  ('faculty', 'planning', 'view'),
  ('faculty', 'anomaly', 'view'),
  ('faculty', 'goals', 'view'),
  ('faculty', 'audit', 'view'),
  ('faculty', 'travel', 'view'),
  ('technician', 'live', 'view'),
  ('technician', 'device', 'view'),
  ('technician', 'anomaly', 'view'),
  ('technician', 'audit', 'view')
) as d(role, module_key, access_level)
join public.dashboard_modules m on m.module_key = d.module_key
on conflict (role, module_key) do nothing;

