# Backend

Loyaltea uses a JavaScript Node/Express API server with Supabase as the only persistence and authentication platform.

Supabase provides PostgreSQL, Supabase Auth, and Row Level Security. Node/Express owns application logic and database transactions.

The complete database contract is in `schema.sql`. It intentionally resets the previous Loyaltea tables, then creates the tables, constraints, indexes, auth profile trigger, immutable ledger triggers, and defense-in-depth RLS policies. Run it once in the Supabase SQL editor for a clean development database.

The Express API lives in `src/`. It verifies Supabase Auth bearer tokens, then uses a server-only service-role client for storage and a PostgreSQL pool for Node-owned transactions. `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` must exist only in the backend environment and must never be sent to the browser.

Environment variables:

- `SUPABASE_URL`: identifies your Supabase project.
- `SUPABASE_ANON_KEY`: lets the backend call Supabase Auth sign-in/sign-up endpoints.
- `SUPABASE_SERVICE_ROLE_KEY`: lets the backend read/write storage tables. Keep this secret.
- `DATABASE_URL`: lets Node run atomic PostgreSQL transactions. Keep this secret.
- `FRONTEND_ORIGIN`: allows the browser frontend to call Express through CORS.
- `AUTH_REDIRECT_URL`: Supabase confirmation callback. Set this to the deployed Vercel callback URL in production.
- `PUBLIC_SIGNUP_ENABLED`: Set to `false` to disable public signup; set to `true` only after configuring Supabase phone/email signup and the required verification provider.

Phone authentication requires Supabase Phone Auth and an enabled SMS provider. The API accepts E.164 phone numbers such as `+213555123456`; it does not infer a country code.

Earn and redeem logic is implemented in `src/database.js`; PostgreSQL is used by Node for transactions, foreign keys, unique idempotency keys, and storage. There are no application RPCs in the new schema.

Run `npm install`, copy `.env.example` to `.env`, and start with `npm run dev`. The frontend uses `VITE_API_URL` to reach this API. No separate database server is introduced.

For email confirmation, add `http://localhost:5173/auth/callback` to Supabase Auth URL Configuration. The browser must be started with `cd frontend && npm run dev`; the API runs separately on port 3000.
