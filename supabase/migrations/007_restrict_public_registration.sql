-- Migration 007: Restrict Public Registration to CUSTOMER Only
-- 1. Ensure any public/anon signup is unconditionally assigned CUSTOMER role.
-- 2. Only privileged service_role via raw_app_meta_data can assign BUSINESS_OWNER or PLATFORM_ADMIN.
-- 3. Maintain strict search_path = public, pg_temp.
-- 4. Preserve existing accounts and conflict updates.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assigned_role public.app_role;
  assigned_phone text;
begin
  -- raw_app_meta_data can ONLY be written by auth.admin (service_role) API.
  -- Public anon signups can only write raw_user_meta_data and are strictly assigned CUSTOMER.
  if (new.raw_app_meta_data ->> 'role') = 'BUSINESS_OWNER' then
    assigned_role := 'BUSINESS_OWNER'::public.app_role;
  elsif (new.raw_app_meta_data ->> 'role') = 'PLATFORM_ADMIN' then
    assigned_role := 'PLATFORM_ADMIN'::public.app_role;
  else
    assigned_role := 'CUSTOMER'::public.app_role;
  end if;

  assigned_phone := coalesce(nullif(new.phone, ''), new.raw_user_meta_data ->> 'phone');

  insert into public.users (id, role, full_name, phone)
  values (
    new.id,
    assigned_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Member'), '@', 1)),
    assigned_phone
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
    phone = coalesce(nullif(excluded.phone, ''), public.users.phone),
    updated_at = now();

  if assigned_role = 'CUSTOMER' then
    insert into public.customers (id, email)
    values (new.id, new.email)
    on conflict (id) do update set
      email = coalesce(excluded.email, public.customers.email),
      updated_at = now();
  end if;

  return new;
end;
$$;

