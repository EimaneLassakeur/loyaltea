import { apiFetch } from '../lib/api'

export async function loadDashboard(accessToken, period = 30, businessId = '') {
  const query = new URLSearchParams({ period: String(period) })
  if (businessId) query.set('businessId', businessId)
  return apiFetch(`/api/dashboard?${query.toString()}`, accessToken)
}

export async function loadBusinesses(accessToken) {
  return apiFetch('/api/businesses', accessToken)
}

export async function earnLoyalty(accessToken, membershipId, locationId, model, amount, requestId) {
  return apiFetch('/api/loyalty/earn', accessToken, {
    method: 'POST',
    body: JSON.stringify({ membershipId, locationId, model, amount, requestId }),
  })
}

export async function redeemReward(accessToken, membershipId, rewardId, locationId, requestId) {
  return apiFetch('/api/loyalty/redeem', accessToken, {
    method: 'POST',
    body: JSON.stringify({ membershipId, rewardId, locationId, requestId }),
  })
}

export async function createBusiness(accessToken, payload) {
  return apiFetch('/api/businesses', accessToken, { method: 'POST', body: JSON.stringify(payload) })
}

export async function createWorkspace(accessToken, payload) {
  return apiFetch('/api/businesses/onboard', accessToken, { method: 'POST', body: JSON.stringify(payload) })
}

export async function createLocation(accessToken, payload) {
  return apiFetch('/api/locations', accessToken, { method: 'POST', body: JSON.stringify(payload) })
}

export async function createProgram(accessToken, payload) {
  return apiFetch('/api/programs', accessToken, { method: 'POST', body: JSON.stringify(payload) })
}

export async function createReward(accessToken, payload) {
  return apiFetch('/api/rewards', accessToken, { method: 'POST', body: JSON.stringify(payload) })
}

export async function getPublicProgram(programId) {
  return apiFetch(`/api/public/programs/${programId}`)
}

export async function getPublicBusiness(businessSlug) {
  return apiFetch(`/api/public/businesses/${encodeURIComponent(businessSlug)}`)
}

export async function joinProgram(accessToken, programId) {
  return apiFetch(`/api/public/programs/${programId}/join`, accessToken, { method: 'POST' })
}

export async function lookupMembership(accessToken, secureToken) {
  return apiFetch(`/api/loyalty/lookup/${secureToken}`, accessToken)
}
