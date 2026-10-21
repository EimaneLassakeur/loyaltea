import { useEffect, useRef, useState } from 'react'
import {
  apiFetch,
  clearStoredSession,
  getStoredSession,
  refreshAuthSession,
  saveStoredSession,
} from '../lib/api'
import { AuthContext } from './authContextValue'

function readInitialSession() {
  const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '')
  const accessToken = params.get('access_token')
  if (window.location.pathname === '/auth/callback' && params.get('error')) {
    clearStoredSession()
    return null
  }
  if (!accessToken) return getStoredSession()
  const expiresIn = Number(params.get('expires_in') || 3600)
  const session = {
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || '',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    token_type: params.get('token_type') || 'bearer',
  }
  return saveStoredSession(session)
}

function readInitialAuthError() {
  if (window.location.pathname !== '/auth/callback') return ''
  const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '')
  const description = params.get('error_description')
  return description ? `Email confirmation failed: ${description}` : ''
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readInitialSession)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(readInitialSession()))
  const [error, setError] = useState(readInitialAuthError)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      window.history.replaceState({}, document.title, '/')
    }
  }, [])

  // Initial profile boot or profile reload when session is newly established
  useEffect(() => {
    let active = true

    const loadProfile = async () => {
      const currentSession = getStoredSession() || session
      if (!currentSession) {
        if (active) setLoading(false)
        return
      }

      try {
        const result = await apiFetch('/api/me', currentSession.access_token)
        if (active) {
          setProfile({ ...result.profile, pendingSubscription: result.pendingSubscription || null })
          setError('')
        }
      } catch (requestError) {
        if (!active) return
        if (requestError?.status === 401 || !getStoredSession()) {
          // Token is genuinely invalid and refresh failed
          clearStoredSession()
          setSession(null)
          setProfile(null)
          setError(requestError.message || 'Your session has expired. Please sign in again.')
        } else {
          // Network or server issue: retain session, report error
          setError(requestError.message || 'Could not connect to Loyaltea. Please check your connection.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    if (session && !profile) {
      loadProfile()
    }

    return () => {
      active = false
    }
  }, [session, profile])

  // Global session expiration & silent refresh listeners
  useEffect(() => {
    const handleSessionExpired = () => {
      clearStoredSession()
      setSession(null)
      setProfile(null)
      setError('Your session has expired. Please sign in again.')
    }

    const handleSessionRefreshed = (event) => {
      const newSession = event.detail
      if (newSession && isMountedRef.current) {
        setSession(newSession)
      }
    }

    window.addEventListener('loyaltea:session-expired', handleSessionExpired)
    window.addEventListener('loyaltea:session-refreshed', handleSessionRefreshed)
    return () => {
      window.removeEventListener('loyaltea:session-expired', handleSessionExpired)
      window.removeEventListener('loyaltea:session-refreshed', handleSessionRefreshed)
    }
  }, [])

  // Proactive background session renewal & focus/wakeup check
  useEffect(() => {
    if (!session?.refresh_token) return undefined

    let timerId = null

    const checkAndScheduleRefresh = () => {
      if (timerId) clearTimeout(timerId)
      const current = getStoredSession() || session
      if (!current?.refresh_token) return

      const expiresAt = Number(current.expires_at || 0) * 1000
      const now = Date.now()
      // Renew 2 minutes before access token expiry, or in 5 seconds if already near/expired
      const delay = Math.max(5000, expiresAt - now - 120_000)

      timerId = window.setTimeout(async () => {
        try {
          const refreshed = await refreshAuthSession()
          if (refreshed && isMountedRef.current) {
            setSession(refreshed)
          }
        } catch (refreshErr) {
          // If network error, schedule a retry in 30 seconds
          if (refreshErr.isNetworkError || !refreshErr.status) {
            timerId = window.setTimeout(checkAndScheduleRefresh, 30_000)
          }
        }
      }, delay)
    }

    checkAndScheduleRefresh()

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const current = getStoredSession() || session
        const now = Math.floor(Date.now() / 1000)
        // If expired or will expire within 2 minutes, refresh immediately
        if (current?.expires_at && now >= current.expires_at - 120) {
          checkAndScheduleRefresh()
        }
      }
    }

    const handleOnline = () => {
      checkAndScheduleRefresh()
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)
    window.addEventListener('online', handleOnline)

    return () => {
      if (timerId) clearTimeout(timerId)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, [session])

  const signIn = async (identifier, identifierType, password) => {
    setError('')
    try {
      const result = await apiFetch('/api/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ identifier, identifierType, password }),
      })
      const saved = saveStoredSession(result.session)
      setSession(saved)
      setError('')
      try {
        const meResult = await apiFetch('/api/me', saved.access_token)
        setProfile({ ...meResult.profile, pendingSubscription: meResult.pendingSubscription || null })
      } catch {
        // Handled by effect if profile fetch fails
      }
      return { data: result }
    } catch (requestError) {
      const errorMsg = requestError.message
      setError(errorMsg)
      return { error: requestError }
    }
  }

  const signUp = async ({ phone, email, password, fullName, role }) => {
    setError('')
    try {
      const result = await apiFetch('/api/auth/signup', null, {
        method: 'POST',
        body: JSON.stringify({ phone, email, password, fullName, role }),
      })
      if (result.session) {
        const saved = saveStoredSession(result.session)
        setSession(saved)
        setError('')
        try {
          const meResult = await apiFetch('/api/me', saved.access_token)
          setProfile({ ...meResult.profile, pendingSubscription: meResult.pendingSubscription || null })
        } catch {
          // Handled by effect if profile fetch fails
        }
      }
      return { data: result }
    } catch (requestError) {
      const errorMsg = requestError.message
      setError(errorMsg)
      return { error: requestError }
    }
  }

  const signOut = async () => {
    try {
      if (session?.access_token) {
        await apiFetch('/api/auth/logout', session.access_token, { method: 'POST' }).catch(() => {
          // Ignore logout errors - session may already be ended
        })
      }
    } finally {
      clearStoredSession()
      setSession(null)
      setProfile(null)
      setError('')
    }
  }

  const clearError = () => setError('')

  return (
    <AuthContext.Provider value={{ session, profile, loading, error, signIn, signUp, signOut, clearError }}>
      {children}
    </AuthContext.Provider>
  )
}
