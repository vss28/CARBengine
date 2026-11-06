-- Run this in Supabase Dashboard → SQL Editor to support public signup; rerun after changing this function.
-- The app does not accept a role during signup: every new account is a student.
-- Department is collected during signup and stored as profile information.

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
