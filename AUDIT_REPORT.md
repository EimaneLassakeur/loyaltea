# Loyaltea — Full Codebase Audit, Bug Fixes, and Subscription Architecture Review

Act as a senior full-stack engineer responsible for stabilizing the existing Loyaltea SaaS platform.

We have made multiple changes to QR generation, authentication, subscriptions, translations, and dashboards, but several issues remain. **Stop adding new functionalities. First inspect the entire codebase, understand the existing architecture, identify root causes, fix the current problems, and verify that the application works correctly.**

Do not assume previous implementations are correct. Do not apply superficial UI fixes to backend or routing problems.

## PHASE 1 — AUDIT THE ENTIRE CODEBASE

Before modifying files:

1. Inspect the complete repository structure, frontend, backend, database schema, migrations, authentication, authorization, routing, API calls, environment variables, and deployment configuration.
2. Identify the actual frameworks, dependencies, entry points, and production architecture.
3. Trace the complete flow for each user role:
   - `PLATFORM_ADMIN`
   - `BUSINESS_OWNER`
   - `CUSTOMER`
4. Inspect all QR generation and joining flows, subscription checks, business status checks, authentication redirects, and language switching.
5. Search for duplicated logic, obsolete implementations, broken routes, hardcoded URLs, localhost references, ScanApp integrations, fake data, unfinished buttons, missing error handling, and inconsistent database fields.
6. Check frontend/backend API compatibility and Supabase integration.
7. Inspect security-sensitive operations, environment variables, database permissions, and role enforcement.

Create a concise audit report identifying:

- Confirmed bugs and their root causes.
- Broken or incomplete user flows.
- Database inconsistencies and migration risks.
- Security vulnerabilities.
- Deployment and configuration problems.
- Components that work correctly and must not be unnecessarily rewritten.

Then implement the fixes. Do not stop after producing the report.

## PHASE 2 — FIX QR SCANNING FOR CUSTOMERS AND BUSINESSES

The QR scanning experience must not depend on ScanApp or an external scanning service.

### Customer side

- Customers must be able to scan a business QR code using the built-in camera application on Android or iPhone.
- The QR code must contain a valid HTTPS URL pointing to the correct Loyaltea business/program page.
- The native camera should recognize the URL and offer to open it in the browser.
- After login or registration, the customer must return to the same business/program.
- Validate the business and its eligibility on the backend before allowing enrollment.

### Business side

- Fix QR code generation, display, and downloading.
- Fix the "Show Join QR" button and any "program link unavailable" errors.
- Identify why the current links are missing or broken.
- Generate QR codes locally using a maintained library.
- Display the exact destination URL and provide a working Copy Link action.
- Ensure URLs use the real production domain and an implemented public route.
- Do not generate localhost URLs, undefined URLs, or links to nonexistent routes.
- Existing valid QR links should remain compatible where possible. If a route change is unavoidable, implement a safe backward-compatible redirect when appropriate.

### Camera behavior

A website cannot force a phone's native camera to open automatically. The customer scans the QR code using the phone's camera.

On a PC, display the QR code and a copyable link; do not pretend that the website automatically scans its own screen using the PC camera.

Search the entire codebase for ScanApp references and obsolete QR implementations. Remove obsolete code only after verifying its dependencies.

Test the actual generated QR destination and confirm it opens the correct business page in production.

## PHASE 3 — CLARIFY AND SEPARATE THE TWO SUBSCRIPTION SYSTEMS

The platform has two different subscription concepts. They must be independent and clearly named throughout the database, backend, frontend, and UI.

### A. Loyaltea platform subscription — business pays Loyaltea

This subscription determines whether a business is allowed to use the Loyaltea application.

It is managed by `PLATFORM_ADMIN`.

It should support the existing business subscription workflow, including:

- Subscription plans offered to business owners.
- Plan price and duration.
- Pending payment, active, expired, and suspended states where appropriate.
- Manual cash-payment recording.
- Start date, end date, and renewal.
- Business activation and suspension according to subscription status.
- Payment history and audit records.

Replace vague or confusing labels such as "Plan d'abonnement" with concrete terminology such as:

- French: "Abonnement à Loyaltea"
- Arabic: "اشتراك النشاط في منصة Loyaltea"

Use the existing data model where possible. Inspect the current schema before creating new tables or migrations.

### B. Business loyalty program — business serves its own customers

This is the loyalty program that the business offers to its customers.

It determines the customer's loyalty experience, not the business's right to access Loyaltea.

Examples of program settings may include the program name, points or rewards rules, and other settings already supported by the application.

Use clear terminology such as:

- French: "Programme de fidélité"
- Arabic: "برنامج الولاء"

Do not confuse a business's payment to Loyaltea with a customer's participation in the business's loyalty program.

Rules:

- A business can have a platform subscription and a separate loyalty program.
- A customer's enrollment belongs to a specific business loyalty program.
- Platform subscription expiration must not accidentally delete customer accounts, loyalty history, or payment records.
- Business owners must not be able to activate their own platform subscriptions or falsify payments.
- Enforce access restrictions on the backend.
- Preserve the existing manual payment and renewal workflow.

Do not introduce online payment integration or unrelated subscription features in this task.

## PHASE 4 — FIX FRENCH AND ARABIC TRANSLATIONS

Audit every affected page and component. Reuse the existing internationalization system rather than creating another one.

### Business dashboard

- Translate all loyalty program performance sections into French and Arabic.
- Translate "Sign out" consistently:
  - French: "Se déconnecter"
  - Arabic: "تسجيل الخروج"
- Ensure buttons, headings, status messages, forms, dialogs, errors, loading states, and empty states use the selected language.
- Fix hardcoded English strings.

### Admin dashboard

- Translate "Renouveler l'abonnement" into French and Arabic.
- Translate "Créer un compte" into French and Arabic.
- Update subscription labels to clearly distinguish the Loyaltea platform subscription from the business loyalty program.
- Ensure the create-business form and renewal/payment actions remain functional after translation.

### General translation requirements

- French must use LTR layout.
- Arabic must use RTL layout.
- Switching languages must update visible content immediately.
- Preserve entered form data when switching languages.
- Check navigation menus, buttons, tables, dashboard cards, validation messages, and confirmation dialogs.
- Avoid mixing languages unintentionally.

Use the existing translation conventions and correct missing keys rather than scattering conditional strings throughout components.

## PHASE 5 — FULL FUNCTIONALITY AND SECURITY REVIEW

Check all existing features before adding anything new.

### Functional checks

- Login, registration, logout, session persistence, and role-based redirects.
- Admin business creation and management.
- Business account access when subscriptions are pending, active, expired, or suspended.
- Subscription plan assignment, manual payment recording, and renewal.
- Business loyalty program access and configuration.
- Customer QR entry, login/registration redirects, and program enrollment.
- QR display, URL copying, downloading, and production links.
- French/Arabic translations and RTL/LTR layout.
- Buttons, forms, API requests, loading states, empty states, and error messages.

Remove fake data from production-facing flows and replace it with real API/database data. Do not silently remove features that are expected to work.

### Security checks

- Enforce authorization on backend endpoints, not only in React.
- Verify ownership of businesses and loyalty programs.
- Validate input and handle unauthorized, missing, and malformed resources.
- Review SQL injection, cross-site scripting, CSRF where applicable, insecure direct object references, privilege escalation, session handling, and rate limiting.
- Inspect Supabase Row Level Security policies and database grants.
- Ensure service-role keys and other secrets are never exposed in frontend bundles or committed files.
- Never disable TLS certificate verification to make deployment work.
- Avoid logging passwords, tokens, or sensitive personal data.
- Do not run destructive production database operations or reset real data.

Report any high-risk issue that cannot safely be fixed automatically.

## PHASE 6 — TEST, STABILIZE, AND VERIFY DEPLOYMENT

Use the existing project scripts and testing framework.

1. Run the frontend production build.
2. Run available backend tests and linting.
3. Test API endpoints and database operations.
4. Add focused regression tests for the bugs fixed in this task.
5. Verify environment variable names and frontend/backend URL configuration.
6. Check that no production flow depends on localhost.
7. Verify the deployed QR URL format and route configuration.
8. Check for runtime errors, failed API calls, and broken imports.
9. Confirm that all modified buttons perform real actions.
10. Test French and Arabic on the affected dashboards.

If browser or deployment access is unavailable, distinguish between tests actually executed and tests that still require manual verification. Never claim that production works merely because the local build succeeds.

## STRICT RULES

- Do not add new business features during this task.
- Do not redesign the entire application.
- Do not migrate to another framework or replace the existing architecture.
- Do not introduce TypeScript, Next.js, or a new UI framework.
- Do not duplicate existing services, routes, translation systems, or database tables.
- Do not create fake records to make screens appear functional.
- Do not disable authentication, authorization, subscription checks, or TLS verification.
- Do not make destructive database changes without a reviewed migration and a safe rollback strategy.
- Preserve existing valid data and working functionality.
- Fix root causes rather than adding more workarounds.

## FINAL REPORT REQUIRED

When finished, provide:

1. **Audit findings:** confirmed bugs, root causes, and security risks.
2. **Changes made:** files modified and why.
3. **Database changes:** migrations, schema modifications, and deployment steps.
4. **QR verification:** exact production URL pattern and test results.
5. **Subscription model:** clearly explain the distinction between the Loyaltea platform subscription and the business loyalty program.
6. **Translation status:** French and Arabic fixes completed.
7. **Test results:** commands executed, tests passed/failed, and build status.
8. **Remaining issues:** anything not fixed or not verifiable.
9. **Deployment checklist:** required Render, Vercel, or Supabase configuration changes.

Start by inspecting the entire repository and documenting the actual architecture. Then proceed systematically through the phases, testing each fix before moving on. Prioritize application stability, data integrity, and security over speed.
