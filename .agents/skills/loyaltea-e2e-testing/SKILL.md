---
name: loyaltea-e2e-testing
description: Playwright end-to-end testing, browser test scenarios, responsive viewport verification, and regression prevention for Loyaltea.
---

# Loyaltea End-to-End (E2E) & Regression Testing

This skill guides repeatable browser testing and QA for Loyaltea using Playwright and Chrome DevTools.

## 1. Core End-to-End Scenarios

1. **Authentication & Multi-Role Login**:
   - Customer email/phone authentication.
   - Business owner dashboard access.
   - Platform admin control panel access.
2. **QR-Code Joining & Membership**:
   - Business owner generates program QR code.
   - Customer joins program by scanning or entering program link.
   - Loyalty card appears in customer wallet with initial point balance (0 or welcome bonus).
3. **Point Accumulation & Transactions**:
   - Staff/Counter interface records a customer visit/transaction.
   - Points increment accurately on customer card and reflect in transaction history.
4. **Reward Redemption**:
   - Customer achieves target reward threshold.
   - Reward redemption token/code generated.
   - Staff confirms redemption, deducting points and logging audit record.

## 2. Responsive Viewport Test Matrix

Execute tests across all mandatory widths:
| Device Target | Viewport Width | Height | Key Verification |
| :--- | :--- | :--- | :--- |
| Ultra-compact mobile | 320px | 640px | No horizontal overflow, readable cards |
| Standard mobile | 375px | 812px | Proper button touch targets (min 44px) |
| Large mobile | 425px | 915px | Fluid typography and balance |
| Tablet | 768px | 1024px | Grid cards & navigation menu |
| Desktop | 1280px | 800px | Multi-column layout & analytics charts |

## 3. Arabic RTL Visual Verification

- Ensure `dir="rtl"` is present on `html` or main container.
- Check that point indicators, transaction dates, and back navigation flow right-to-left.
- Ensure form inputs, labels, and badges align to the right edge.
