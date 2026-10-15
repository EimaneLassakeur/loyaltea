-- 009_business_deletion_and_cascade.sql
-- Allow subscriptions without payments to cascade on business deletion
-- while preserving strict RESTRICT protection on financial records (subscription_payments, transactions, reward_redemptions).

alter table public.subscriptions
  drop constraint if exists subscriptions_business_id_fkey,
  add constraint subscriptions_business_id_fkey
    foreign key (business_id)
    references public.businesses(id)
    on delete cascade;

-- Performance index for active business queries
create index if not exists idx_businesses_archived_at on public.businesses(archived_at);

