# Loyaltea — Antigravity Engineering Guidelines & Project Rules

Welcome to the **Loyaltea** development environment. All agents, subagents, and contributors operating within this repository must adhere to the following principles, rules, and operational constraints.

---

## 1. Architectural Integrity & Discovery First

1. **Inspect Before Changing**:
   - Always analyze existing directory layouts, component structures, API contracts, and database models before proposing or making changes.
   - Do not make architectural assumptions; inspect existing code in `frontend/src/` and `backend/src/`.
2. **Reuse Existing Patterns & Components**:
   - Reuse UI primitives, state management helpers, styling tokens, and middleware rather than creating redundant duplicates.
3. **Dependency Discipline**:
   - Avoid introducing new third-party npm packages unless strictly necessary and justified.
   - Use standard platform capabilities, native web APIs, or existing installed libraries (`lucide-react`, `tailwindcss`, `html5-qrcode`, `qrcode.react`, etc.).
4. **Naming Conventions**:
   - Follow established conventions: PascalCase for React components, camelCase for JavaScript utilities and backend route handlers, snake_case for database columns and SQL identifiers.
5. **Architectural Decisions**:
   - Explain non-trivial trade-offs and rationale when making design decisions. Avoid introducing breaking changes to existing APIs or database schemas.

---

## 2. Security & Data Protection Guardrails

1. **Row Level Security (RLS) is Non-Negotiable**:
   - **CRITICAL**: NEVER disable or weaken Row Level Security (RLS) policies to bypass an application error.
   - Always debug the root cause (e.g., missing authentication token, incorrect `auth.uid()`, missing tenant foreign key) and write correct, performant RLS policies.
2. **Protect Service-Role Credentials**:
   - NEVER expose Supabase `service_role` keys in client-side code, Git commits, environment templates, logs, or prompt outputs.
   - The frontend must ONLY consume the public anonymous key (`VITE_SUPABASE_ANON_KEY`).
   - Privileged operations must remain strictly on the backend or in protected Edge Functions.
3. **Role-Based Access Control (RBAC)**:
   - Enforce strict role boundaries across the 3 core personas: **Platform Administrators**, **Business Owners / Merchants**, and **Customers**.
   - Ensure business owners can only view and modify their own store, loyalty programs, employees, and customer memberships.
4. **Defensive API Engineering & Input Validation**:
   - Validate and sanitize all incoming request bodies, route parameters, and query parameters before processing.
   - Enforce rate limiting (`express-rate-limit`), security headers (`helmet`), and strict CORS rules on all backend endpoints.
   - Use consistent structured JSON error responses with meaningful HTTP status codes.

---

## 3. Database Engineering & Migrations

1. **Formal Migrations**:
   - All database schema alterations must be authored as clean, sequential, idempotent SQL migration files in `supabase/migrations/`.
   - Never perform unversioned ad-hoc database modifications that diverge from the repository.
2. **PostgreSQL Best Practices**:
   - Always index foreign keys and columns frequently used in query filters.
   - Maintain lowercase column and table identifiers without spaces.
   - Use explicit primary keys and appropriate foreign key cascading rules.

---

## 4. Internationalization & Arabic RTL Support

1. **Preserve Multilingual Support**:
   - The Loyaltea interface supports **French (FR)**, **Arabic (AR)**, and **English (EN)**.
   - Any new user-facing copy, label, notification, or error message must support translations across all active languages.
2. **Arabic RTL (Right-to-Left) Geometry**:
   - Ensure proper bidirectional support (`dir="rtl"`).
   - Use logical Tailwind CSS / CSS properties (e.g., `start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `me-*`) instead of hardcoded `left-*` and `right-*`.
   - Verify that chevron arrows, progress bars, and modal alignments mirror correctly in Arabic without breaking LTR layout.

---

## 5. Responsive Design & Multi-Viewport Verification

1. **Responsive Matrix**:
   - All frontend screens must be responsive and tested across:
     * **320px** (Ultra-compact mobile)
     * **375px** (Standard mobile)
     * **425px** (Large mobile)
     * **768px** (Tablet)
     * **1024px+ / 1280px** (Desktop)
2. **Mobile-First Loyalty Scenarios**:
   - Customer loyalty cards, QR-code display, and QR scanner camera viewports must work flawlessly on mobile touchscreens without horizontal overflow or clipping.

---

## 6. Verification & Quality Assurance (No Blind Completions)

1. **Verify Before Completion**:
   - **NEVER claim a feature or fix works without verifying it.**
   - Run linter checks (`npm run lint`), build checks (`npm run build`), or browser tests before concluding a task.
   - Use Chrome DevTools MCP or Playwright MCP to inspect live pages, check console errors, examine network payloads, and verify UI elements.
2. **Zero Production Mutation During Setup**:
   - Never create, alter, or delete live customer or business records during environment setup or testing routines.
