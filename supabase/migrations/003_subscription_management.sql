-- Non-destructive subscription management migration.
-- Apply after 001_initial.sql and 002_phone_auth_compatibility.sql.

create type public.subscription_status as enum ('pending', 'active', 'past_due', 'suspended', 'cancelled', 'expired');
create type public.payment_method as enum ('CASH');

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'DZD' check (length(trim(currency)) between 3 and 3),
  duration_days integer not null check (duration_days > 0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.subscription_status not null default 'pending',
  created_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index subscriptions_one_current_per_business
  on public.subscriptions(business_id)
  where status in ('pending', 'active', 'past_due', 'suspended');
create index subscriptions_business_idx on public.subscriptions(business_id, ends_at desc);
create index subscriptions_status_idx on public.subscriptions(status, ends_at);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (length(trim(currency)) between 3 and 3),
  received_at timestamptz not null default now(),
  method public.payment_method not null default 'CASH',
  reference text,
  notes text,
  recorded_by uuid not null references public.users(id) on delete restrict,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);
create index subscription_payments_business_idx on public.subscription_payments(business_id, received_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  action text not null check (length(trim(action)) between 1 and 120),
  target_type text not null check (length(trim(target_type)) between 1 and 80),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_business_idx on public.audit_logs(business_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id, created_at desc);

create trigger subscription_plans_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.audit_logs enable row level security;

create policy plans_read_active on public.subscription_plans for select using (is_active or exists (select 1 from public.users where id = auth.uid() and role = 'PLATFORM_ADMIN'));
create policy subscriptions_read_authorized on public.subscriptions for select using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  or exists (select 1 from public.employees e where e.business_id = business_id and e.user_id = auth.uid() and e.is_active)
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'PLATFORM_ADMIN')
);
create policy payments_read_authorized on public.subscription_payments for select using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'PLATFORM_ADMIN')
);
create policy audit_logs_admin_read on public.audit_logs for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'PLATFORM_ADMIN'));

insert into public.subscription_plans (name, description, price, currency, duration_days)
select 'Standard', 'Default plan; configure pricing before production use.', 0, 'DZD', 30
where not exists (select 1 from public.subscription_plans);
