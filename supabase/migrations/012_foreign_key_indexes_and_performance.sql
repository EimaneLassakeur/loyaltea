-- 012_foreign_key_indexes_and_performance.sql
-- Performance optimization: add missing B-tree indexes on foreign key columns
-- to prevent table locks on parent cascades and optimize join query performance.

-- 1. Businesses & Locations
CREATE INDEX IF NOT EXISTS idx_businesses_owner_user_id ON public.businesses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_business_locations_business_id ON public.business_locations(business_id);

-- 2. Programs & Employees
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_business_id ON public.loyalty_programs(business_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_business_id ON public.employees(business_id);

-- 3. Customer Memberships & Rewards
CREATE INDEX IF NOT EXISTS idx_customer_memberships_customer_id ON public.customer_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_program_id ON public.customer_memberships(program_id);
CREATE INDEX IF NOT EXISTS idx_rewards_program_id ON public.rewards(program_id);

-- 4. Transactions & Redemptions
CREATE INDEX IF NOT EXISTS idx_transactions_location_id ON public.transactions(location_id);
CREATE INDEX IF NOT EXISTS idx_transactions_employee_id ON public.transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_location_id ON public.reward_redemptions(location_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_employee_id ON public.reward_redemptions(employee_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward_id ON public.reward_redemptions(reward_id);

-- 5. Customer Events
CREATE INDEX IF NOT EXISTS idx_customer_events_business_id ON public.customer_events(business_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_customer_id ON public.customer_events(customer_id);

-- 6. Subscriptions & Payments
CREATE INDEX IF NOT EXISTS idx_subscriptions_business_id ON public.subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_by ON public.subscriptions(created_by);
CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_by ON public.subscriptions(updated_by);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription_id ON public.subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_business_id ON public.subscription_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_recorded_by ON public.subscription_payments(recorded_by);

-- 7. Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id ON public.audit_logs(business_id);

-- 8. Tighten search_path for sync_auth_phone_to_profile function
CREATE OR REPLACE FUNCTION public.sync_auth_phone_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
begin
  update public.users
  set phone = new.phone,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;
