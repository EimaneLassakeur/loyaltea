-- Migration 005: Fix RLS infinite recursion
-- Resolves PostgreSQL error 42P17 (infinite recursion detected in policy for relation "employees")
-- Replaces recursive direct table subqueries in policies with safe, stable SECURITY DEFINER helper functions.
-- Forward-only migration; preserves all existing data and access rules.

-- ==============================================================================
-- 1. SECURITY DEFINER AUTHORIZATION HELPER FUNCTIONS
-- ==============================================================================

create or replace function public.is_platform_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when user_id is null then false
    else exists (
      select 1
      from public.users
      where id = user_id
        and role = 'PLATFORM_ADMIN'
    )
  end;
$$;

create or replace function public.is_business_owner(business_id uuid, user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when business_id is null or user_id is null then false
    else exists (
      select 1
      from public.businesses
      where id = business_id
        and owner_user_id = user_id
    )
  end;
$$;

create or replace function public.is_business_employee(business_id uuid, user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when business_id is null or user_id is null then false
    else exists (
      select 1
      from public.employees
      where business_id = is_business_employee.business_id
        and user_id = is_business_employee.user_id
        and is_active = true
    )
  end;
$$;

create or replace function public.can_manage_business(business_id uuid, user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when user_id is null or business_id is null then false
    else (
      public.is_business_owner(business_id, user_id)
      or public.is_business_employee(business_id, user_id)
      or public.is_platform_admin(user_id)
    )
  end;
$$;

create or replace function public.business_has_active_program(business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when business_id is null then false
    else exists (
      select 1
      from public.loyalty_programs
      where business_id = business_has_active_program.business_id
        and is_active = true
    )
  end;
$$;

-- Restrict function execution permissions to authorized database roles
revoke all on function public.is_platform_admin(uuid) from public;
revoke all on function public.is_business_owner(uuid, uuid) from public;
revoke all on function public.is_business_employee(uuid, uuid) from public;
revoke all on function public.can_manage_business(uuid, uuid) from public;
revoke all on function public.business_has_active_program(uuid) from public;

grant execute on function public.is_platform_admin(uuid) to authenticated, anon;
grant execute on function public.is_business_owner(uuid, uuid) to authenticated, anon;
grant execute on function public.is_business_employee(uuid, uuid) to authenticated, anon;
grant execute on function public.can_manage_business(uuid, uuid) to authenticated, anon;
grant execute on function public.business_has_active_program(uuid) to authenticated, anon;

-- ==============================================================================
-- 2. RESTRUCTURE RLS POLICIES TO ELIMINATE RECURSION
-- ==============================================================================

-- Businesses
drop policy if exists businesses_read on public.businesses;
drop policy if exists businesses_admin_lifecycle_read on public.businesses;

create policy businesses_read on public.businesses for select using (
  owner_user_id = auth.uid()
  or public.is_business_employee(id, auth.uid())
  or public.is_platform_admin(auth.uid())
  or public.business_has_active_program(id)
);

-- Employees
drop policy if exists employees_read on public.employees;

create policy employees_read on public.employees for select using (
  user_id = auth.uid()
  or public.is_business_owner(business_id, auth.uid())
  or public.is_platform_admin(auth.uid())
);

-- Business Locations
drop policy if exists locations_read on public.business_locations;

create policy locations_read on public.business_locations for select using (
  public.can_manage_business(business_id, auth.uid())
);

-- Loyalty Programs
drop policy if exists programs_read on public.loyalty_programs;

create policy programs_read on public.loyalty_programs for select using (
  is_active = true
  or public.can_manage_business(business_id, auth.uid())
);

-- Rewards
drop policy if exists rewards_read on public.rewards;

create policy rewards_read on public.rewards for select using (
  (is_active = true and (expires_at is null or expires_at > now()))
  or exists (
    select 1 from public.loyalty_programs p
    where p.id = rewards.program_id
      and public.can_manage_business(p.business_id, auth.uid())
  )
);

-- Customer Memberships
drop policy if exists memberships_read on public.customer_memberships;

create policy memberships_read on public.customer_memberships for select using (
  customer_id = auth.uid()
  or exists (
    select 1 from public.loyalty_programs p
    where p.id = customer_memberships.program_id
      and public.can_manage_business(p.business_id, auth.uid())
  )
);

-- Transactions
drop policy if exists transactions_read on public.transactions;

create policy transactions_read on public.transactions for select using (
  exists (
    select 1 from public.customer_memberships m
    where m.id = transactions.membership_id
      and m.customer_id = auth.uid()
  )
  or public.can_manage_business(business_id, auth.uid())
);

-- Reward Redemptions
drop policy if exists redemptions_read on public.reward_redemptions;

create policy redemptions_read on public.reward_redemptions for select using (
  exists (
    select 1 from public.customer_memberships m
    where m.id = reward_redemptions.membership_id
      and m.customer_id = auth.uid()
  )
  or public.can_manage_business(business_id, auth.uid())
);

-- Customer Events
drop policy if exists events_read on public.customer_events;

create policy events_read on public.customer_events for select using (
  customer_id = auth.uid()
  or public.can_manage_business(business_id, auth.uid())
);

-- Subscriptions
drop policy if exists subscriptions_read_authorized on public.subscriptions;

create policy subscriptions_read_authorized on public.subscriptions for select using (
  public.can_manage_business(business_id, auth.uid())
);

-- Subscription Payments
drop policy if exists payments_read_authorized on public.subscription_payments;

create policy payments_read_authorized on public.subscription_payments for select using (
  public.is_business_owner(business_id, auth.uid())
  or public.is_platform_admin(auth.uid())
);

