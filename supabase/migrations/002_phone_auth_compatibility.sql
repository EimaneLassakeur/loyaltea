-- Compatibility migration for phone-first Supabase Auth.
-- Safe and non-destructive: preserves user IDs, roles, memberships, and existing records.
-- Apply only after enabling Phone Auth and the required SMS provider in Supabase.

alter table if exists public.users
  add column if not exists phone text;

create index if not exists users_phone_idx on public.users(phone) where phone is not null;

-- Keep the application profile synchronized with Supabase Auth phone changes.
create or replace function public.sync_auth_phone_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set phone = new.phone,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_auth_phone_to_profile on auth.users;
create trigger sync_auth_phone_to_profile
after update of phone on auth.users
for each row execute function public.sync_auth_phone_to_profile();

revoke all on function public.sync_auth_phone_to_profile() from public;
