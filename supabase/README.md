# Supabase Setup

Use a new Supabase project for the rebuilt platform.

1. Open Supabase SQL Editor.
2. Run the entire `migrations/001_initial.sql` file, not only the selected portion.
3. Enable email/password authentication in Supabase Auth.
4. In `Authentication` -> `URL Configuration`, set the local Site URL to `http://localhost:5173` and add this Redirect URL:
	`http://localhost:5173/auth/callback`
5. Configure the backend `.env` with the project URL, anon key, service-role key, and pooled PostgreSQL URL.
6. Never put the service-role key in frontend environment variables.

`backend/schema.sql` is the legacy destructive schema and is not the source of truth for new deployments. Do not run it against a production database.

The migration intentionally removes leftover Loyaltea tables, enum types, and the old auth trigger before recreating the schema. It creates the core tables, indexes, auth profile trigger, immutable ledger triggers, relationship checks, and read RLS policies. The Express server remains responsible for authenticated business mutations and transaction authorization.
