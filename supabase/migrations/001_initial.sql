-- Loyaltea fresh-project schema.
-- Apply to a new Supabase project. This migration is authoritative for new databases.

create extension if not exists pgcrypto;

-- This is a fresh-project migration. Remove leftover objects from a previous
-- Loyaltea attempt before creating the authoritative schema below.
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.customer_events cascade;
drop table if exists public.reward_redemptions cascade;
drop table if exists public.transactions cascade;
drop table if exists public.rewards cascade;
drop table if exists public.customer_memberships cascade;
drop table if exists public.customers cascade;
drop table if exists public.employee_locations cascade;
drop table if exists public.employees cascade;
drop table if exists public.loyalty_programs cascade;
drop table if exists public.business_locations cascade;
drop table if exists public.businesses cascade;
drop table if exists public.users cascade;
drop type if exists public.transaction_type cascade;
drop type if exists public.loyalty_model cascade;
drop type if exists public.app_role cascade;

create type public.app_role as enum ('BUSINESS_OWNER', 'MANAGER', 'EMPLOYEE', 'CUSTOMER', 'PLATFORM_ADMIN');
create type public.loyalty_model as enum ('STAMPS', 'POINTS');
create type public.transaction_type as enum ('EARN', 'REDEEM', 'ADJUSTMENT');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'CUSTOMER',
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  model public.loyalty_model not null,
  points_per_currency numeric(12, 4),
  currency_unit text not null default 'DZD',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((model = 'STAMPS' and points_per_currency is null) or (model = 'POINTS' and points_per_currency > 0))
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  role public.app_role not null check (role in ('MANAGER', 'EMPLOYEE')),
  permissions jsonb not null default '{"earn": true, "redeem": true, "view_customers": true}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, business_id)
);

create table public.employee_locations (
  employee_id uuid not null references public.employees(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete cascade,
  primary key (employee_id, location_id)
);

create table public.customers (
  id uuid primary key references public.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  secure_token uuid not null default gen_random_uuid() unique,
  stamps_balance integer not null default 0 check (stamps_balance >= 0),
  points_balance integer not null default 0 check (points_balance >= 0),
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, program_id)
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  image_url text,
  required_stamps integer,
  required_points integer,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((required_stamps is not null and required_stamps > 0 and required_points is null) or (required_points is not null and required_points > 0 and required_stamps is null))
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.customer_memberships(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  location_id uuid references public.business_locations(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  type public.transaction_type not null,
  stamps_delta integer not null default 0,
  points_delta integer not null default 0,
  idempotency_key uuid not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (stamps_delta <> 0 or points_delta <> 0),
  check ((type = 'EARN' and (stamps_delta > 0 or points_delta > 0)) or (type = 'REDEEM' and stamps_delta <= 0 and points_delta <= 0) or type = 'ADJUSTMENT')
);

create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.customer_memberships(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  location_id uuid references public.business_locations(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table public.customer_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  event_type text not null check (length(trim(event_type)) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index businesses_owner_idx on public.businesses(owner_user_id);
create index locations_business_idx on public.business_locations(business_id, is_active);
create index programs_business_idx on public.loyalty_programs(business_id, is_active);
create index employees_business_idx on public.employees(business_id, user_id, is_active);
create index employee_locations_location_idx on public.employee_locations(location_id, employee_id);
create index memberships_program_idx on public.customer_memberships(program_id);
create index memberships_customer_idx on public.customer_memberships(customer_id);
create index memberships_token_idx on public.customer_memberships(secure_token);
create index rewards_program_idx on public.rewards(program_id, is_active);
create index transactions_business_idx on public.transactions(business_id, created_at desc);
create index transactions_membership_idx on public.transactions(membership_id, created_at desc);
create index redemptions_business_idx on public.reward_redemptions(business_id, created_at desc);
create index redemptions_membership_idx on public.reward_redemptions(membership_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger businesses_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger locations_updated_at before update on public.business_locations for each row execute function public.set_updated_at();
create trigger programs_updated_at before update on public.loyalty_programs for each row execute function public.set_updated_at();
create trigger employees_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.customer_memberships for each row execute function public.set_updated_at();
create trigger rewards_updated_at before update on public.rewards for each row execute function public.set_updated_at();

create or replace function public.validate_loyalty_relationships()
returns trigger language plpgsql as $$
declare membership_business uuid; membership_program uuid; reward_model public.loyalty_model; program_model public.loyalty_model;
begin
  select p.business_id, p.id, p.model into membership_business, membership_program, program_model
  from public.customer_memberships m join public.loyalty_programs p on p.id = m.program_id where m.id = new.membership_id;
  if new.business_id <> membership_business then raise exception 'Transaction business does not match membership program'; end if;
  if TG_TABLE_NAME = 'transactions' then
    if program_model = 'STAMPS' and new.points_delta <> 0 then raise exception 'Stamps programs cannot create points transactions'; end if;
    if program_model = 'POINTS' and new.stamps_delta <> 0 then raise exception 'Points programs cannot create stamp transactions'; end if;
  end if;
  if new.location_id is not null and not exists (select 1 from public.business_locations l where l.id = new.location_id and l.business_id = new.business_id) then raise exception 'Transaction location does not belong to business'; end if;
  if new.employee_id is not null and not exists (select 1 from public.employees e where e.id = new.employee_id and e.business_id = new.business_id) then raise exception 'Transaction employee does not belong to business'; end if;
  if TG_TABLE_NAME = 'reward_redemptions' then
    select p.model into reward_model from public.rewards r join public.loyalty_programs p on p.id = r.program_id where r.id = new.reward_id;
    if not exists (select 1 from public.rewards r where r.id = new.reward_id and r.program_id = membership_program) then raise exception 'Reward does not belong to membership program'; end if;
  end if;
  return new;
end;
$$;

create trigger transactions_relationships before insert on public.transactions for each row execute function public.validate_loyalty_relationships();
create trigger redemptions_relationships before insert on public.reward_redemptions for each row execute function public.validate_loyalty_relationships();

create or replace function public.validate_reward_model()
returns trigger language plpgsql as $$
declare program_model public.loyalty_model;
begin
  select model into program_model from public.loyalty_programs where id = new.program_id;
  if program_model = 'STAMPS' and (new.required_stamps is null or new.required_points is not null) then raise exception 'Stamps programs require stamp rewards'; end if;
  if program_model = 'POINTS' and (new.required_points is null or new.required_stamps is not null) then raise exception 'Points programs require point rewards'; end if;
  return new;
end;
$$;
create trigger rewards_model_validation before insert or update on public.rewards for each row execute function public.validate_reward_model();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'CUSTOMER');
  if requested_role not in ('BUSINESS_OWNER', 'CUSTOMER') then requested_role := 'CUSTOMER'; end if;
  insert into public.users (id, role, full_name, phone)
  values (new.id, requested_role::public.app_role, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Member'), '@', 1)), new.phone)
  on conflict (id) do nothing;
  if requested_role = 'CUSTOMER' then
    insert into public.customers (id, email) values (new.id, new.email)
    on conflict (id) do update set email = excluded.email, updated_at = now();
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Loyalty ledger records are immutable';
end;
$$;
create trigger transactions_immutable before update or delete on public.transactions for each row execute function public.prevent_ledger_mutation();
create trigger redemptions_immutable before update or delete on public.reward_redemptions for each row execute function public.prevent_ledger_mutation();

alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.business_locations enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.employees enable row level security;
alter table public.employee_locations enable row level security;
alter table public.customers enable row level security;
alter table public.customer_memberships enable row level security;
alter table public.rewards enable row level security;
alter table public.transactions enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.customer_events enable row level security;

create policy users_self_read on public.users for select using (id = auth.uid());
create policy customers_self_read on public.customers for select using (id = auth.uid());
create policy businesses_read on public.businesses for select using (owner_user_id = auth.uid() or exists (select 1 from public.employees e where e.business_id = id and e.user_id = auth.uid() and e.is_active) or exists (select 1 from public.loyalty_programs p where p.business_id = id and p.is_active));
create policy locations_read on public.business_locations for select using (exists (select 1 from public.businesses b where b.id = business_id and (b.owner_user_id = auth.uid() or exists (select 1 from public.employees e where e.business_id = b.id and e.user_id = auth.uid() and e.is_active))));
create policy programs_read on public.loyalty_programs for select using (is_active or exists (select 1 from public.businesses b where b.id = business_id and (b.owner_user_id = auth.uid() or exists (select 1 from public.employees e where e.business_id = b.id and e.user_id = auth.uid() and e.is_active))));
create policy employees_read on public.employees for select using (user_id = auth.uid() or exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()));
create policy memberships_read on public.customer_memberships for select using (customer_id = auth.uid() or exists (select 1 from public.loyalty_programs p join public.businesses b on b.id = p.business_id where p.id = program_id and (b.owner_user_id = auth.uid() or exists (select 1 from public.employees e where e.business_id = b.id and e.user_id = auth.uid() and e.is_active))));
create policy rewards_read on public.rewards for select using (is_active and (expires_at is null or expires_at > now()) or exists (select 1 from public.loyalty_programs p join public.businesses b on b.id = p.business_id where p.id = program_id and (b.owner_user_id = auth.uid() or exists (select 1 from public.employees e where e.business_id = b.id and e.user_id = auth.uid() and e.is_active))));
create policy transactions_read on public.transactions for select using (exists (select 1 from public.customer_memberships m where m.id = membership_id and m.customer_id = auth.uid()) or exists (select 1 from public.businesses b where b.id = business_id and (b.owner_user_id = auth.uid() or exists (select 1 from public.employees e where e.business_id = b.id and e.user_id = auth.uid() and e.is_active))));
create policy redemptions_read on public.reward_redemptions for select using (exists (select 1 from public.customer_memberships m where m.id = membership_id and m.customer_id = auth.uid()) or exists (select 1 from public.businesses b where b.id = business_id and (b.owner_user_id = auth.uid() or exists (select 1 from public.employees e where e.business_id = b.id and e.user_id = auth.uid() and e.is_active))));
create policy events_read on public.customer_events for select using (customer_id = auth.uid() or exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()));

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.validate_loyalty_relationships() from public;
revoke all on function public.validate_reward_model() from public;
revoke all on function public.prevent_ledger_mutation() from public;
