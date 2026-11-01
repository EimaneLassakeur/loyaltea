---
name: loyaltea-rtl-i18n
description: Guidelines and patterns for French, Arabic, and English internationalization (i18n) and Arabic right-to-left (RTL) layout rendering in Loyaltea.
---

# Loyaltea Arabic RTL & Internationalization (i18n)

This skill governs multilingual support and bidirectional layout in the Loyaltea platform.

## Supported Languages

- **French (`fr`)**: Primary business and administrative language in target markets.
- **Arabic (`ar`)**: Right-to-Left (RTL) layout with standard Arabic typography.
- **English (`en`)**: Secondary international option.

## 1. Bidirectional Layout Rules (LTR vs RTL)

- When `language === 'ar'`, the root container or document element must have `dir="rtl"`.
- Always use CSS logical properties or Tailwind logical classes:
  - Use `start-*` and `end-*` instead of `left-*` and `right-*`.
  - Use `ps-*` and `pe-*` (padding-inline-start/end) instead of `pl-*` and `pr-*`.
  - Use `ms-*` and `me-*` (margin-inline-start/end) instead of `ml-*` and `mr-*`.
  - Use `text-start` and `text-end` instead of `text-left` and `text-right`.

## 2. Directional Icons & Controls

- Directional icons (e.g., arrow chevrons `ChevronRight`, `ArrowLeft`, navigation back buttons) must be mirrored when in RTL mode:
  ```tsx
  <ChevronRight className={isRtl ? "rotate-180" : ""} />
  ```
- Non-directional icons (e.g., search magnifying glass, lock, settings gear, coffee cup) must NOT be rotated.

## 3. String Keys & Pluralization

- Never hardcode raw French or Arabic strings inside component logic or API payloads.
- Maintain localization dictionaries for all UI text, input placeholders, validation errors, and modal confirmations.
- Always provide fallback strings to prevent empty UI elements if a translation key is missing.
