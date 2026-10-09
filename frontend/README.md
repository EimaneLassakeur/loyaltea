# Loyaltea

Loyaltea is a mobile-first digital loyalty platform for independent businesses. The frontend is React + Vite + JavaScript with Tailwind CSS available through the Vite plugin. The frontend communicates only with the Express API.

## Frontend setup

```bash
npm install
npm run dev
```

Create a local `.env` file for the frontend and set the deployed Render API URL:

```env
VITE_API_URL=<your-render-api-url>
```

`VITE_API_URL` is required; the frontend has no localhost fallback. Do not add any Supabase URL, anon key, service-role key, or database URL to the frontend. All Supabase operations go through Express.

## Backend API

```bash
cd ../backend
npm install
copy .env.example .env
npm run dev
```

The API verifies Supabase access tokens, uses server-only Supabase credentials for storage, and exposes routes under `/api`. The browser does not connect to Supabase Data API or invoke loyalty RPCs directly. Keep `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` exclusively in `backend/.env`.

## Database setup

Run `backend/schema.sql` in the Supabase SQL editor. It resets the old Loyaltea tables and creates the single schema used by the Express backend. It is destructive for the existing Loyaltea data, so use it only for a fresh development database.

The dashboard requires the Express API to be running and an authenticated user. It reads businesses, memberships, transactions, and redemptions through Express. Balance changes are performed by Node transactions; the browser never updates loyalty balances directly.

For a fresh Supabase project, apply `../supabase/migrations/001_initial.sql`. Do not apply the legacy destructive `../backend/schema.sql` to an existing database.
