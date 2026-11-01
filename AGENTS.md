# Loyaltea — Agent Operating Instructions & Core Rules

This file defines the authoritative operating guidelines for all AI agents working on the Loyaltea codebase.

## Core Rules

1. **Architecture & Scope**:
   - Inspect existing architecture in `frontend/` and `backend/` prior to implementing changes.
   - Reuse existing components, hooks, utilities, and styles. Avoid adding redundant libraries.
   - Preserve existing naming conventions (PascalCase components, camelCase utilities/routes, snake_case database columns).
   - Document significant architectural choices and maintain backward compatibility.

2. **Security & Data Isolation**:
   - Maintain strict tenant isolation between Businesses, Employees, and Customers.
   - Enforce Row Level Security (RLS) on all Supabase tables. NEVER weaken or disable RLS to resolve permission errors.
   - NEVER expose Supabase service-role keys or sensitive credentials in client bundles, Git commits, or documentation.
   - Enforce server-side input validation, rate limiting, and defensive error envelopes.

3. **Database Discipline**:
   - Author idempotent, ordered SQL migrations in `supabase/migrations/`.
   - Index all foreign key columns and frequently filtered fields.
   - Use proper constraint definitions and data types.

4. **Localization (i18n) & Arabic RTL**:
   - Preserve French, Arabic, and English translations.
   - Use CSS logical properties (`start`/`end`, `ps`/`pe`, `ms`/`me`) to guarantee proper Arabic RTL rendering alongside LTR.
   - Ensure icons, badges, and card progress indicators mirror appropriately in RTL.

5. **Responsive Design Requirements**:
   - Test layouts across 320px, 375px, 425px, 768px, and 1024px+ viewports.
   - Ensure mobile screens render without layout shifts, clipped badges, or horizontal scrollbars.

6. **Validation & Verification**:
   - Test changes using linting, type checks, build commands, and browser automation (Chrome DevTools / Playwright).
   - Never declare completion without verifying functionality.
   - Do not mutate production data during verification.
