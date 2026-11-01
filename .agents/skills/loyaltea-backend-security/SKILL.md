---
name: loyaltea-backend-security
description: Node.js, Express, REST API design, Supabase Auth verification, role-based access control, input validation, and defensive backend security for Loyaltea.
---

# Loyaltea Backend & API Security Guide

This skill guides backend development, API endpoints, authentication, and security in the Loyaltea Node.js/Express service.

## 1. Authentication & Role-Based Access Control (RBAC)

Loyaltea enforces four distinct caller contexts:
1. **Platform Administrator**: Full cross-tenant access to subscriptions, platform health, and audit logs.
2. **Business Owner**: Full authority over their specific registered business, branches, programs, rewards, employees, and membership data.
3. **Employee / Counter Staff**: Scoped to transaction recording, member card lookup, and points issuance/redemption for their assigned business location.
4. **Customer**: Scoped strictly to their own loyalty cards, memberships, points balance, and redemption history.

### Authentication Middleware Flow
- Validate bearer JWT tokens from Supabase Auth (`supabase.auth.getUser(token)`).
- Resolve internal user identity (`public.users` table).
- Enforce tenant boundary checks: `business_id` from route parameters must match the authenticated user's associated business.

## 2. Input Validation & Defensive Engineering

- Validate all incoming `req.body`, `req.params`, and `req.query` attributes.
- Use explicit data type assertions and schema constraints before invoking database queries.
- Never trust client-provided point values, balances, or discount amounts; always calculate and verify point additions and redemptions server-side.

## 3. Rate Limiting & Protection

- Enforce `express-rate-limit` on sensitive routes (login, counter QR scanning, redemption verification).
- Configure `helmet` for security headers (HSTS, Content Security Policy, X-Content-Type-Options).
- Ensure CORS origins are strictly bound to trusted domains (e.g. `loyaltea.vercel.app`, local dev `localhost:5173`).

## 4. Standard Response Envelope

All API endpoints must return structured JSON:
```json
{
  "success": true,
  "data": { ... }
}
```
Or on error:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED_TENANT_ACCESS",
    "message": "User does not have access to this business resource."
  }
}
```
