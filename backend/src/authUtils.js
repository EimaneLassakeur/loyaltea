/**
 * Normalizes email address by trimming, lowercasing, and verifying basic structure.
 * @param {string} value
 * @returns {string} Normalized email or empty string if invalid.
 */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}

/**
 * Normalizes phone number to E.164 international format (+[1-9]\d{7,14}).
 * Supports Algerian local formats (05/06/07..., 5/6/7...) and international inputs.
 * @param {string} value
 * @returns {string} E.164 phone string or empty string if invalid.
 */
export function normalizePhone(value) {
  if (typeof value !== 'string') return ''
  let cleaned = value.trim().replace(/[\s().-]/g, '')
  if (!cleaned) return ''

  // Replace leading 00 with + (international prefix)
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2)
  }

  // Algerian domestic 10-digit mobile starting with 0 (05..., 06..., 07...)
  if (/^0[567]\d{8}$/.test(cleaned)) {
    return '+213' + cleaned.slice(1)
  }

  // Algerian domestic 9-digit mobile without leading 0 (5..., 6..., 7...)
  if (/^[567]\d{8}$/.test(cleaned)) {
    return '+213' + cleaned
  }

  // Algerian number entered as 2135..., 2136..., 2137... without leading +
  if (/^213[567]\d{8}$/.test(cleaned)) {
    return '+' + cleaned
  }

  // Standard E.164 international format: + followed by 8 to 15 digits
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return cleaned
  }

  return ''
}

export function isValidEmail(value) {
  return normalizeEmail(value) !== ''
}

export function isValidPhone(value) {
  return normalizePhone(value) !== ''
}

