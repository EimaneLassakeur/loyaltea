# Backend

Loyaltea uses a JavaScript Node/Express API server with Supabase as the only persistence and authentication platform.

Supabase provides PostgreSQL, Supabase Auth, and Row Level Security. Node/Express owns application logic and database transactions.

The complete database contract is in `schema.sql`. It intentionally resets the previous Loyaltea tables, then creates the tables, constraints, indexes, auth profile trigger, immutable ledger triggers, and defense-in-depth RLS policies. Run it once in the Supabase SQL editor for a clean development database.

The Express API lives in `src/`. It verifies Supabase Auth bearer tokens, then uses a server-only service-role client for storage and a PostgreSQL pool for Node-owned transactions. `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` must exist only in the backend environment and must never be sent to the browser.

Environment variables:

- `SUPABASE_URL`: identifies your Supabase project.
- `SUPABASE_ANON_KEY`: lets the backend call Supabase Auth sign-in/sign-up endpoints.
- `SUPABASE_SERVICE_ROLE_KEY`: lets the backend read/write storage tables. Keep this secret.
- `DATABASE_URL`: lets Node run atomic PostgreSQL transactions. Keep this secret. For Render, use the exact Supabase Dashboard **Connect > Session pooler** URI. Keep its host and port unchanged.
- `DATABASE_SSL_CA_B64`: base64-encoded Supabase CA certificate downloaded from **Database Settings > SSL Configuration**. This is required because production verifies the certificate chain.
- `DATABASE_SSL_REJECT_UNAUTHORIZED`: must be `true`; the backend rejects any other value.
- `FRONTEND_ORIGIN`: allows the browser frontend to call Express through CORS.
- `AUTH_REDIRECT_URL`: Supabase confirmation callback. Set this to the deployed Vercel callback URL in production.
- `PUBLIC_SIGNUP_ENABLED`: Set to `false` to disable public signup; set to `true` only after configuring Supabase phone/email signup and the required verification provider.

Phone authentication requires Supabase Phone Auth and an enabled SMS provider. The API accepts E.164 phone numbers such as `+213555123456`; it does not infer a country code.

Earn and redeem logic is implemented in `src/database.js`; PostgreSQL is used by Node for transactions, foreign keys, unique idempotency keys, and storage. There are no application RPCs in the new schema.

Run `npm install`, copy `.env.example` to `.env`, and start with `npm run dev`. The frontend uses `VITE_API_URL` to reach this API. No separate database server is introduced.

For email confirmation, add `http://localhost:5173/auth/callback` to Supabase Auth URL Configuration. The browser must be started with `cd frontend && npm run dev`; the API runs separately on port 3000.

## Render PostgreSQL TLS setup

1. In Supabase, open **Connect**, select **Session pooler**, and copy the complete connection string. Use the exact pooler host and port supplied by the dashboard; do not substitute a guessed regional endpoint.
2. In Supabase **Database Settings > SSL Configuration**, download the current CA certificate. Encode the complete certificate file as base64 and set the result as Render's `DATABASE_SSL_CA_B64` secret. Do not paste the certificate into logs or source control.
3. Set Render variables: `NODE_ENV=production`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, `DATABASE_URL=<exact Session Pooler URI>`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_ORIGIN=<Vercel HTTPS URL>`, and `AUTH_REDIRECT_URL=<Vercel HTTPS callback URL>`.
4. Do not add `sslmode`, `sslrootcert`, `sslcert`, or `sslkey` query parameters to `DATABASE_URL`. The Node `pg` pool removes conflicting SSL URL parameters and supplies one verified TLS configuration with hostname validation.
5. Redeploy Render. Startup runs `select 1`; it logs only success or the error name/code. A `SELF_SIGNED_CERT_IN_CHAIN` result means the CA is missing, malformed, stale, or is not the CA downloaded for this Supabase project. Download the certificate again from the dashboard and replace `DATABASE_SSL_CA_B64`.

The Session Pooler port must match the mode copied from Supabase. Session mode is normally port `5432`; port `6543` is transaction mode and has different driver limitations. This backend uses transactions and prepared-query-compatible session mode.
