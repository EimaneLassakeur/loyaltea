const apiBaseUrl = import.meta.env.VITE_API_URL

if (!apiBaseUrl) {
  throw new Error('VITE_API_URL is not configured')
}

export const SESSION_KEY = 'loyaltea.session'

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function saveStoredSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
  const expiresIn = Number(session.expires_in) || 3600
  const normalized = {
    ...session,
    expires_in: expiresIn,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + expiresIn,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
  return normalized
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY)
}

// Module-level in-flight refresh promise to deduplicate concurrent refresh calls
let activeRefreshPromise = null

export async function refreshAuthSession() {
  if (activeRefreshPromise) {
    return activeRefreshPromise
  }

  const currentSession = getStoredSession()
  if (!currentSession?.refresh_token) {
    clearStoredSession()
    window.dispatchEvent(new Event('loyaltea:session-expired'))
    const err = new Error('No refresh token available')
    err.status = 401
    err.code = 'NO_REFRESH_TOKEN'
    throw err
  }

  activeRefreshPromise = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentSession.refresh_token }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        // If 400 or 401: Refresh token is permanently invalid, revoked, or expired
        if (response.status === 400 || response.status === 401) {
          clearStoredSession()
          window.dispatchEvent(new Event('loyaltea:session-expired'))
          const err = new Error(payload.error || 'Your session has expired. Please sign in again.')
          err.status = response.status
          err.code = payload.code || 'SESSION_EXPIRED'
          throw err
        }

        // For temporary errors (e.g. 429 rate limit or 5xx server issues),
        // keep the stored session intact so the user is not kicked out!
        const err = new Error(payload.error || `Session refresh failed with status ${response.status}`)
        err.status = response.status
        err.code = payload.code
        throw err
      }

      if (!payload.session?.access_token) {
        clearStoredSession()
        window.dispatchEvent(new Event('loyaltea:session-expired'))
        const err = new Error('Invalid refresh response from server')
        err.status = 401
        err.code = 'INVALID_REFRESH_PAYLOAD'
        throw err
      }

      const updatedSession = saveStoredSession(payload.session)
      // Broadcast session refreshed event so React context updates seamlessly
      window.dispatchEvent(new CustomEvent('loyaltea:session-refreshed', { detail: updatedSession }))
      return updatedSession
    } catch (err) {
      if (err instanceof TypeError) {
        // Network connection error - do NOT clear session! User may be offline temporarily.
        const networkErr = new Error(`Network error during session refresh: ${err.message}`)
        networkErr.isNetworkError = true
        throw networkErr
      }
      throw err
    } finally {
      activeRefreshPromise = null
    }
  })()

  return activeRefreshPromise
}

export async function apiFetch(path, accessToken, options = {}) {
  // If accessToken wasn't explicitly passed, try using stored session's token
  let token = accessToken
  const isAuthRoute = path.startsWith('/api/auth/')
  const isPublicRoute = path.startsWith('/api/public/')
  if (!token && !options.skipAuth && !isAuthRoute && !isPublicRoute) {
    const stored = getStoredSession()
    token = stored?.access_token || null
  }

  // Preemptive check: If token is known to be expired (and refresh_token exists), refresh now
  if (!isAuthRoute && token) {
    const currentSession = getStoredSession()
    const now = Math.floor(Date.now() / 1000)
    if (currentSession?.refresh_token && currentSession.expires_at && now >= currentSession.expires_at - 15) {
      try {
        const refreshed = await refreshAuthSession()
        if (refreshed?.access_token) {
          token = refreshed.access_token
        }
      } catch (refreshErr) {
        // If refresh failed because session is permanently invalid, rethrow
        if (refreshErr.status === 401 || refreshErr.status === 400) {
          throw refreshErr
        }
        // If network or server error, continue with current token and let request attempt
      }
    }
  }

  const makeRequest = async (authBearer) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(authBearer ? { Authorization: `Bearer ${authBearer}` } : {}),
      ...options.headers,
    }
    return fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
    })
  }

  let response
  try {
    response = await makeRequest(token)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Network error: ${error.message}. Is the API server running?`)
    }
    throw error
  }

  // Handle 401 Unauthorized
  if (response.status === 401) {
    // If this was an auth route (like login/signup/refresh), do not attempt refresh retry
    if (isAuthRoute) {
      const payload = await response.json().catch(() => ({}))
      const err = new Error(payload.error || `Request failed with status ${response.status}`)
      err.status = 401
      err.code = payload.code
      throw err
    }

    // For protected routes, check if we can refresh
    const currentSession = getStoredSession()
    if (currentSession?.refresh_token) {
      try {
        let freshToken = token
        // If the token in localStorage is already newer than the one that failed,
        // another concurrent request already refreshed it!
        if (currentSession.access_token && currentSession.access_token !== token) {
          freshToken = currentSession.access_token
        } else {
          // Trigger or await the deduplicated token refresh
          const newSession = await refreshAuthSession()
          freshToken = newSession.access_token
        }

        // Retry the original request with the fresh token
        const retryResponse = await makeRequest(freshToken)
        if (retryResponse.status === 204) {
          return {}
        }
        const retryPayload = await retryResponse.json().catch(() => ({}))
        if (!retryResponse.ok) {
          const err = new Error(retryPayload.error || `Request failed with status ${retryResponse.status}`)
          err.status = retryResponse.status
          err.code = retryPayload.code
          throw err
        }
        return retryPayload
      } catch (refreshError) {
        // If refresh failed with 401/400 (session revoked/expired), clear session and notify
        if (refreshError.status === 401 || refreshError.status === 400 || !getStoredSession()) {
          clearStoredSession()
          window.dispatchEvent(new Event('loyaltea:session-expired'))
          const err = new Error('Your session has expired. Please sign in again.')
          err.status = 401
          throw err
        }
        throw refreshError
      }
    } else {
      // No refresh token available
      clearStoredSession()
      window.dispatchEvent(new Event('loyaltea:session-expired'))
      const err = new Error('Your session has expired. Please sign in again.')
      err.status = 401
      throw err
    }
  }

  if (response.status === 204) {
    return {}
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(payload.error || `Request failed with status ${response.status}`)
    err.status = response.status
    err.code = payload.code
    throw err
  }
  return payload
}
