-- Non-destructive business lifecycle controls for admin pause/resume/archive.
-- Apply after 003_subscription_management.sql.

create type public.business_status as enum ('active', 'paused', 'suspended', 'pending');

alter table public.businesses
  add column status public.business_status not null default 'active',
  add column archived_at timestamptz;

create index businesses_status_idx on public.businesses(status, archived_at);

create policy businesses_admin_lifecycle_read on public.businesses for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'PLATFORM_ADMIN')
);
