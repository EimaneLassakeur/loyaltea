import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { AuthContext } from './authContextValue'

const SESSION_KEY = 'loyaltea.session'

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

function readInitialSession() {
  const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '')
  const accessToken = params.get('access_token')
  if (window.location.pathname === '/auth/callback' && params.get('error')) {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
  if (!accessToken) return readStoredSession()
  const expiresIn = Number(params.get('expires_in') || 3600)
  const session = {
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || '',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    token_type: params.get('token_type') || 'bearer',
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(readInitialAuthError)

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      window.history.replaceState({}, document.title, '/')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadProfile = async (activeSession) => {
      if (!activeSession) {
        if (mounted) setLoading(false)
        return
      }
      try {
        const result = await apiFetch('/api/me', activeSession.access_token)
        if (mounted) {
          setProfile(result.profile)
        }
      } catch (requestError) {
        if (mounted) {
          localStorage.removeItem(SESSION_KEY)
          setSession(null)
          setProfile(null)
          setError(requestError.message || 'Your account profile could not be loaded. Please sign in again.')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadProfile(session)
    return () => {
      mounted = false
    }
  }, [session])

  useEffect(() => {
    const expireSession = () => {
      localStorage.removeItem(SESSION_KEY)
      setSession(null)
      setProfile(null)
      setError('Your session has expired. Please sign in again.')
    }
    window.addEventListener('loyaltea:session-expired', expireSession)
    return () => window.removeEventListener('loyaltea:session-expired', expireSession)
  }, [])

  useEffect(() => {
    if (!session?.refresh_token) return undefined
    const expiresAt = Number(session.expires_at || 0) * 1000
    const refreshIn = Math.max(10_000, expiresAt - Date.now() - 60_000)
    const timer = window.setTimeout(async () => {
      try {
        const result = await apiFetch('/api/auth/refresh', null, { method: 'POST', body: JSON.stringify({ refreshToken: session.refresh_token }) })
        localStorage.setItem(SESSION_KEY, JSON.stringify(result.session))
        setSession(result.session)
      } catch {
        window.dispatchEvent(new Event('loyaltea:session-expired'))
      }
    }, refreshIn)
    return () => window.clearTimeout(timer)
  }, [session])

  const signIn = async (identifier, identifierType, password) => {
    setError('')
    try {
      const result = await apiFetch('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ identifier, identifierType, password }) })
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.session))
      setSession(result.session)
      setError('')
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
      const result = await apiFetch('/api/auth/signup', null, { method: 'POST', body: JSON.stringify({ phone, email, password, fullName, role }) })
      if (result.session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(result.session))
        setSession(result.session)
        setError('')
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
      if (session) {
        await apiFetch('/api/auth/logout', session.access_token, { method: 'POST' }).catch(() => {
          // Ignore errors during logout - token may already be invalid
        })
      }
    } finally {
      localStorage.removeItem(SESSION_KEY)
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

