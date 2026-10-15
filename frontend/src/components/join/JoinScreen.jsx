import { useCallback, useEffect, useState } from 'react'
import { Coffee, Gift } from 'lucide-react'
import { getPublicBusiness, getPublicProgram, joinProgram } from '../../services/dashboardService'
import { apiFetch } from '../../lib/api'
import { normalizeEmail, normalizePhone } from '../../lib/authUtils'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

const publicSignupEnabled = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === 'true'

export default function JoinScreen({ businessSlug, programId, session, profile, onSignIn, onSignUp, onClearError }) {
  const { t } = usePreferences()
  const [program, setProgram] = useState(null)
  const [acceptingMemberships, setAcceptingMemberships] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState(null)
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('sign-in')
  const [loginMethod, setLoginMethod] = useState('email')
  const [form, setForm] = useState({ phone: '', email: '', password: '', fullName: '' })
  const [loadError, setLoadError] = useState(null)
  const [message, setMessage] = useState('')

  // Preserve the return destination in case user navigates away to full login
  useEffect(() => {
    try {
      sessionStorage.setItem('loyaltea.return_to', window.location.pathname)
    } catch {
      // Ignore sessionStorage errors
    }
  }, [])

  const loadData = useCallback(() => {
    const load = businessSlug ? getPublicBusiness(businessSlug) : getPublicProgram(programId)
    return load
      .then((result) => {
        setProgram(result.program)
        if (typeof result.acceptingMemberships === 'boolean') {
          setAcceptingMemberships(result.acceptingMemberships)
        }
      })
      .catch((requestError) => {
        setLoadError(requestError)
        setError(requestError.message)
      })
      .finally(() => setLoading(false))
  }, [businessSlug, programId])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/join/')) {
      sessionStorage.setItem('loyaltea.return_to', window.location.pathname)
    }
    loadData()
  }, [loadData])

  // Check if authenticated customer is already enrolled in this loyalty program
  useEffect(() => {
    if (!session?.access_token || !program?.id) return
    let active = true
    apiFetch('/api/customer/memberships', session.access_token)
      .then((result) => {
        if (!active) return
        const memberships = result?.memberships || []
        const existing = memberships.find((m) => m.program_id === program.id && m.is_active)
        if (existing) {
          setAlreadyEnrolled(true)
          setJoined(existing)
        }
      })
      .catch(() => {
        // Membership lookup failure is non-fatal; enrollment attempt will handle state
      })
    return () => {
      active = false
    }
  }, [session?.access_token, program?.id])

  const retryLoad = () => {
    setLoading(true)
    setLoadError(null)
    setError('')
    loadData()
  }

  // Direct join when user is already authenticated
  const handleDirectJoin = async () => {
    if (!session?.access_token || !program?.id) return
    if (!acceptingMemberships) {
      setError(t('businessNotAccepting'))
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await joinProgram(session.access_token, program.id)
      setJoined(result.membership)
    } catch (requestError) {
      if (requestError.status === 409 || requestError.code === 'MEMBERSHIP_EXISTS') {
        setAlreadyEnrolled(true)
      } else if (requestError.status === 403 || requestError.code === 'BUSINESS_SUBSCRIPTION_INACTIVE') {
        setAcceptingMemberships(false)
        setError(t('businessNotAccepting'))
      } else {
        setError(requestError.message)
      }
    } finally {
      setBusy(false)
    }
  }

  // Authenticate and immediately complete enrollment in one step
  const handleAuthAndJoin = async (event) => {
    event.preventDefault()
    if (!acceptingMemberships) {
      setError(t('businessNotAccepting'))
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    onClearError()

    try {
      let activeSession = session
      if (!activeSession) {
        if (mode === 'sign-in') {
          let identifier = ''
          if (loginMethod === 'phone') {
            identifier = normalizePhone(form.phone)
            if (!identifier) {
              setError(t('invalidPhone'))
              setBusy(false)
              return
            }
          } else {
            identifier = normalizeEmail(form.email)
            if (!identifier) {
              setError(t('invalidEmail'))
              setBusy(false)
              return
            }
          }
          const loginResult = await onSignIn(identifier, loginMethod, form.password)
          if (loginResult.error) {
            if (loginResult.error.code === 'PHONE_PROVIDER_DISABLED') {
              setError(t('phoneProviderDisabled'))
            } else {
              setError(loginResult.error.message)
            }
            setBusy(false)
            return
          }
          activeSession = loginResult.data?.session
        } else {
          // Sign-up
          const normEmail = normalizeEmail(form.email)
          if (!normEmail) {
            setError(t('invalidEmail'))
            setBusy(false)
            return
          }
          const normPhone = form.phone ? normalizePhone(form.phone) : ''
          if (form.phone && !normPhone) {
            setError(t('invalidPhone'))
            setBusy(false)
            return
          }

          const signupResult = await onSignUp({
            email: normEmail,
            phone: normPhone || undefined,
            password: form.password,
            fullName: form.fullName.trim(),
            role: 'CUSTOMER',
          })

          if (signupResult.error) {
            setError(signupResult.error.message)
            setBusy(false)
            return
          }

          activeSession = signupResult.data?.session
          if (!activeSession) {
            setMessage(t('checkVerification'))
            setBusy(false)
            return
          }
        }
      }

      if (!activeSession) {
        throw new Error(t('checkVerification'))
      }

      const result = await joinProgram(activeSession.access_token, program.id)
      setJoined(result.membership)
    } catch (requestError) {
      if (requestError.status === 409 || requestError.code === 'MEMBERSHIP_EXISTS') {
        setAlreadyEnrolled(true)
      } else if (requestError.status === 403 || requestError.code === 'BUSINESS_SUBSCRIPTION_INACTIVE') {
        setAcceptingMemberships(false)
        setError(t('businessNotAccepting'))
      } else {
        setError(requestError.message)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="app-state"><strong>{t('loadingProgram')}</strong></div>
  if (!program) {
    const isNotFound = loadError?.status === 404 || loadError?.code === 'BUSINESS_NOT_FOUND' || loadError?.code === 'NO_ACTIVE_PROGRAM'
    const isBusinessNotFound = loadError?.code === 'BUSINESS_NOT_FOUND'
    return (
      <div className="app-state">
        <strong>{isBusinessNotFound ? t('businessNotFound') : isNotFound ? t('programUnavailable') : t('couldNotLoadProgram')}</strong>
        <p>{isBusinessNotFound ? t('businessNotFound') : isNotFound ? t('programUnavailable') : t('serverErrorTryAgain')}</p>
        {!isNotFound && (
          <button className="primary-button" style={{ marginTop: '12px' }} onClick={retryLoad}>
            {t('tryAgain')}
          </button>
        )}
      </div>
    )
  }

  const isRoleRestricted = session && profile?.role && profile.role !== 'CUSTOMER'

  return (
    <main className="join-page">
      <PreferencesControls />
      <div className="join-card">
        <div className="brand-row auth-brand">
          <div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div>
          <span>loyaltea</span>
        </div>
        <p className="eyebrow">{t('joinCommunity')}</p>
        <h1>{program.businesses?.name}</h1>
        <p className="join-program-name">{program.name}</p>
        <p className="heading-copy">{program.description || t('collectRewards')}</p>

        <div className="join-reward-list">
          {(program.rewards || []).filter((reward) => reward.is_active).map((reward) => (
            <div className="join-reward" key={reward.id}>
              <Gift size={18} />
              <div>
                <strong>{reward.name}</strong>
                <small>
                  {t('unlockAt')} {program.model === 'STAMPS' ? reward.required_stamps : reward.required_points} {program.model === 'STAMPS' ? t('stamps') : t('points')}
                </small>
              </div>
            </div>
          ))}
        </div>

        {joined || alreadyEnrolled ? (
          <div className="join-result-container">
            <div className="form-message join-success">
              {joined ? t('joinSuccess') : t('alreadyEnrolled')}
            </div>
            {joined && (
              <p className="heading-copy" style={{ textAlign: 'center', marginTop: '8px' }}>
                {program.model === 'STAMPS' ? `${joined.stamps_balance || 0} ${t('stamps')}` : `${joined.points_balance || 0} ${t('points')}`}
              </p>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={() => window.location.assign('/')}
            >
              {t('viewLoyaltyWallet')}
            </button>
          </div>
        ) : session ? (
          /* Authenticated customer join flow: No redundant credentials asked */
          <div className="join-action-box">
            {!acceptingMemberships && (
              <div className="form-message form-message-warning" role="alert">
                {t('businessNotAccepting')}
              </div>
            )}
            {isRoleRestricted && (
              <div className="form-message form-message-warning" role="alert">
                {t('customerRoleRequired')}
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            <button
              type="button"
              className="primary-button auth-submit"
              disabled={busy || !acceptingMemberships || isRoleRestricted}
              onClick={handleDirectJoin}
            >
              {busy ? t('joining') : t('joinProgram')}
            </button>
          </div>
        ) : (
          /* Unauthenticated visitor flow: Seamless inline auth + enrollment */
          <form onSubmit={handleAuthAndJoin}>
            <div className="join-form-header">
              <h3>{mode === 'sign-in' ? t('signInToJoin') : t('signUpToJoin')}</h3>
            </div>

            {!acceptingMemberships && (
              <div className="form-message form-message-warning" role="alert">
                {t('businessNotAccepting')}
              </div>
            )}

            {mode === 'sign-up' && (
              <label>
                {t('fullName')}
                <input
                  required
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                />
              </label>
            )}

            {mode === 'sign-in' && (
              <div className="login-method-control">
                <span className="login-method-label">{t('loginMethod')}</span>
                <div className="auth-method-switch" role="group" aria-label={t('loginMethod')}>
                  <button
                    type="button"
                    aria-pressed={loginMethod === 'email'}
                    className={loginMethod === 'email' ? 'active' : ''}
                    onClick={() => { setLoginMethod('email'); setError(''); onClearError() }}
                  >
                    {t('emailLogin')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={loginMethod === 'phone'}
                    className={loginMethod === 'phone' ? 'active' : ''}
                    onClick={() => { setLoginMethod('phone'); setError(''); onClearError() }}
                  >
                    {t('phoneLogin')}
                  </button>
                </div>
              </div>
            )}

            {(mode === 'sign-up' || loginMethod === 'email') && (
              <label>
                {t('email')}
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  autoComplete="email"
                />
              </label>
            )}

            {(mode === 'sign-up' || loginMethod === 'phone') && (
              <label>
                {t('phone')}
                {mode === 'sign-up' && <small> ({t('optional')})</small>}
                <input
                  required={mode === 'sign-in' && loginMethod === 'phone'}
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="+213..."
                  autoComplete="tel"
                />
              </label>
            )}

            <label>
              {t('password')}
              <input
                required
                minLength="8"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              />
            </label>

            {(error || message) && <p className={error ? 'form-error' : 'form-message'}>{error || message}</p>}

            <button
              className="primary-button auth-submit"
              disabled={busy || !acceptingMemberships}
            >
              {busy ? t('joining') : mode === 'sign-in' ? t('signInAndJoin') : t('createAccountAndJoin')}
            </button>
          </form>
        )}

        {!session && publicSignupEnabled && !joined && !alreadyEnrolled && (
          <button
            type="button"
            className="text-button auth-switch"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
              setError('')
              setMessage('')
              onClearError()
            }}
          >
            {mode === 'sign-in' ? t('newCustomerAccount') : t('existingCustomerAccount')}
          </button>
        )}
      </div>
    </main>
  )
}
