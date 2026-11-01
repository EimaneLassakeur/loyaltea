# Loyaltea Project Rules

Persistent rules loaded by Antigravity customization discovery.

- Inspect existing code before modifying.
- Reuse existing components, services, and tokens.
- No unnecessary dependencies.
- Enforce Role-Based Access Control (Admin, Business Owner, Customer).
- Never weaken RLS; diagnose root cause with `auth.uid()`.
- Never expose `service_role` keys client-side.
- All database modifications require versioned migrations in `supabase/migrations/`.
- Validate all API inputs; handle errors with consistent JSON responses.
- Preserve French, Arabic, and English multilingual support.
- Support correct Arabic RTL layout with logical CSS properties.
- Test at 320px, 375px, 425px, 768px, and desktop widths.
- Verify all changes before completion using browser tools or test runners.
