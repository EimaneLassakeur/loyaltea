-- Migration 008: Add RLS policies and uniqueness for loyalty_programs

-- 1. Ensure unique constraint on business_id so each business has at most one loyalty program
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'loyalty_programs_business_id_unique'
  ) then
    alter table public.loyalty_programs
      add constraint loyalty_programs_business_id_unique unique (business_id);
  end if;
end $$;

-- 2. Loyalty programs RLS policies for INSERT, UPDATE, DELETE
drop policy if exists programs_insert on public.loyalty_programs;
create policy programs_insert on public.loyalty_programs
  for insert
  with check (public.can_manage_business(business_id, auth.uid()));

drop policy if exists programs_update on public.loyalty_programs;
create policy programs_update on public.loyalty_programs
  for update
  using (public.can_manage_business(business_id, auth.uid()))
  with check (public.can_manage_business(business_id, auth.uid()));

drop policy if exists programs_delete on public.loyalty_programs;
create policy programs_delete on public.loyalty_programs
  for delete
  using (public.can_manage_business(business_id, auth.uid()));

