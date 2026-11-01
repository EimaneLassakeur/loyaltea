---
name: loyaltea-database-rls
description: PostgreSQL database design, Supabase schema migrations, indexing, query performance, and Row Level Security (RLS) policies for Loyaltea.
---

# Loyaltea Database & Row Level Security (RLS)

This skill governs PostgreSQL database schema design, Supabase migrations, indexing, and Row Level Security for Loyaltea.

## 1. Migration Protocol

- Place all migration scripts in `supabase/migrations/` with sequential numerical prefixes (e.g. `012_...sql`).
- Migrations must be **idempotent**:
  - `CREATE TABLE IF NOT EXISTS ...`
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
  - `CREATE INDEX IF NOT EXISTS ...`
  - `DROP POLICY IF EXISTS ... ON ...` before creating or replacing a policy.
- Never write destructive migrations that drop existing customer or business data without explicit backward compatibility.

## 2. Row Level Security (RLS) Guardrails

- **RLS MUST BE ENABLED** on every table in the `public` schema (`ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`).
- **NEVER DISABLE RLS** to fix a query failure. When an RLS error occurs:
  1. Inspect the active token claims or `auth.uid()`.
  2. Inspect the policy expression (`USING (...)`, `WITH CHECK (...)`).
  3. Ensure join conditions or subqueries in RLS policies utilize indexed foreign keys.
- **Tenant Isolation**:
  - `businesses`: Only accessible by the business owner or platform administrator.
  - `loyalty_programs`: Public read for active programs, write restricted to business owner.
  - `customers`: Only accessible by the customer themselves or by businesses where the customer has an active membership.
  - `transactions` & `reward_redemptions`: Read/write strictly scoped to the participating business and customer.

## 3. Indexing & Query Performance

- Always index foreign key columns:
  - `business_id`, `customer_id`, `program_id`, `location_id`.
- Use composite indexes for frequent joint filters (e.g. `(customer_id, business_id, created_at DESC)`).
- Use `EXPLAIN (ANALYZE, BUFFERS)` via Supabase MCP to diagnose slow queries.
