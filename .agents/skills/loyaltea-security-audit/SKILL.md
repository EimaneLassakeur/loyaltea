---
name: loyaltea-security-audit
description: OWASP Top 10 security audit methodology, tenant boundary verification, secret scanning, and vulnerability prevention for Loyaltea.
---

# Loyaltea Security Audit & OWASP Top 10 Checklist

This skill provides an audit framework to ensure security, compliance, and multi-tenant data safety across Loyaltea.

## OWASP Top 10 Audit Verification

1. **A01: Broken Access Control**:
   - Verify every backend endpoint validates the session token and checks role permissions.
   - Verify that Business A cannot query or alter Business B's customers, points, or analytics.
   - Verify that Supabase RLS is enabled on all tables in `public`.
2. **A02: Cryptographic Failures**:
   - Ensure all network communication uses HTTPS.
   - Ensure sensitive tokens or customer PII are never logged in plaintext or exposed in error responses.
3. **A03: Injection**:
   - Prevent SQL injection: All queries must use parameterized statements or Supabase query builders. Never concatenate user strings into raw SQL.
   - Prevent XSS: React automatically escapes output, but avoid `dangerouslySetInnerHTML`.
4. **A04: Insecure Design**:
   - Rate limiting on counter points accumulation to prevent fraud or rapid repetitive scanning.
   - Require authentication for all non-public endpoints.
5. **A05: Security Misconfiguration**:
   - Verify helmet middleware is active with restrictive headers.
   - Restrict CORS headers to authorized origins only.
6. **A07: Identification and Authentication Failures**:
   - Session timeouts and secure cookie/token storage.
   - Brute-force protection on authentication endpoints.
7. **Secret Hygiene**:
   - Check `.env` and `.env.local` are in `.gitignore`.
   - Never embed Supabase service-role keys in frontend code, Git commits, or documentation.
