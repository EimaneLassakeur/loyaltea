-- Migration 006: Auth Flow and Role Simplification
-- 1. Synchronize phone from user metadata if auth.users.phone is empty or null.
-- 2. Handle conflict updates gracefully without data loss.
-- 3. Maintain strict security definer with fixed search_path = public, pg_temp.
-- 4. Preserve RLS policies without infinite recursion (42P17).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_role text;
  assigned_phone text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'CUSTOMER');
  if requested_role not in ('BUSINESS_OWNER', 'CUSTOMER') then
    requested_role := 'CUSTOMER';
  end if;

  assigned_phone := coalesce(nullif(new.phone, ''), new.raw_user_meta_data ->> 'phone');

  insert into public.users (id, role, full_name, phone)
  values (
    new.id,
    requested_role::public.app_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Member'), '@', 1)),
    assigned_phone
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
    phone = coalesce(nullif(excluded.phone, ''), public.users.phone),
    updated_at = now();

  if requested_role = 'CUSTOMER' then
    insert into public.customers (id, email)
    values (new.id, new.email)
    on conflict (id) do update set
      email = coalesce(excluded.email, public.customers.email),
      updated_at = now();
  end if;

  return new;
end;
$$;

