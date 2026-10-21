import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Coffee, Gift } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getPublicBusiness, getPublicProgram, joinProgram } from '../../services/dashboardService'
import { apiFetch } from '../../lib/api'
import { normalizeEmail, normalizePhone } from '../../lib/authUtils'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

export default function JoinScreen({ businessSlug, programId, session, profile, onSignIn, onSignUp, onClearError }) {
  const { t } = usePreferences()
  const [program, setProgram] = useState(null)
  const [acceptingMemberships, setAcceptingMemberships] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState(null)
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('sign-up') // Default to sign-up for new customers (Case A)
  const [loginMethod, setLoginMethod] = useState('phone')
  const [form, setForm] = useState({ phone: '', email: '', password: '', fullName: '' })
  const [loadError, setLoadError] = useState(null)

  // Preserve the return destination
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/join/')) {
        sessionStorage.setItem('loyaltea.return_to', window.location.pathname)
      }
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
    loadData()
  }, [loadData])

  // Case C: Authenticated customer auto-join and card retrieval
  useEffect(() => {
    if (!session?.access_token || !program?.id || alreadyEnrolled || joined) return
    let active = true

    apiFetch('/api/customer/memberships', session.access_token)
      .then(async (result) => {
        if (!active) return
        const memberships = result?.memberships || []
        const existing = memberships.find((m) => m.program_id === program.id && m.is_active)
        if (existing) {
          setAlreadyEnrolled(true)
          setJoined(existing)
        } else if (profile?.role === 'CUSTOMER' && acceptingMemberships) {
          try {
            const joinRes = await joinProgram(session.access_token, program.id)
            if (active) setJoined(joinRes.membership)
          } catch (joinErr) {
            if (joinErr.status === 409 || joinErr.code === 'MEMBERSHIP_EXISTS') {
              if (active) setAlreadyEnrolled(true)
            }
          }
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [session?.access_token, program?.id, profile?.role, acceptingMemberships, alreadyEnrolled, joined])

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
      setError(t('businessNotAccepting', 'This business is currently not accepting new loyalty members.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await joinProgram(session.access_token, program.id)
      setJoined(result.membership)
    } catch (requestError) {
      if (requestError.status === 409 || requestError.code === 'MEMBERSHIP_EXISTS') {
        setAlreadyEnrolled(true)
      } else if (requestError.status === 403 || requestError.code === 'BUSINESS_SUBSCRIPTION_INACTIVE') {
        setAcceptingMemberships(false)
        setError(t('businessNotAccepting', 'This business is currently not accepting new loyalty members.'))
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
      setError(t('businessNotAccepting', 'This business is currently not accepting new loyalty members.'))
      return
    }
    setBusy(true)
    setError('')
    onClearError()

    try {
      let activeSession = session
      if (!activeSession) {
        if (mode === 'sign-in') {
          // Case B: Returning customer login
          let identifier = ''
          if (loginMethod === 'phone') {
            identifier = normalizePhone(form.phone)
            if (!identifier) {
              setError(t('invalidPhone', 'A valid phone number is required'))
              setBusy(false)
              return
            }
          } else {
            identifier = normalizeEmail(form.email)
            if (!identifier) {
              setError(t('invalidEmail', 'Please enter a valid email address'))
              setBusy(false)
              return
            }
          }
          const loginResult = await onSignIn(identifier, loginMethod, form.password)
          if (loginResult.error) {
            setError(loginResult.error.message)
            setBusy(false)
            return
          }
          activeSession = loginResult.data?.session
        } else {
          // Case A: New customer registration
          const normPhone = normalizePhone(form.phone)
          if (!normPhone) {
            setError(t('invalidPhone', 'A valid phone number is required'))
            setBusy(false)
            return
          }
          const normEmail = form.email ? normalizeEmail(form.email) : ''
          if (form.email && !normEmail) {
            setError(t('invalidEmail', 'Please enter a valid email address'))
            setBusy(false)
            return
          }
          if (!form.fullName || !form.fullName.trim()) {
            setError(t('fullNameRequired', 'Full name is required'))
            setBusy(false)
            return
          }
          if (!form.password || form.password.length < 8) {
            setError(t('passwordMinLength', 'Password must be at least 8 characters'))
            setBusy(false)
            return
          }

          const signupResult = await onSignUp({
            phone: normPhone,
            email: normEmail || undefined,
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
        }
      }

      if (!activeSession) {
        throw new Error(t('couldNotCreateSession', 'Could not establish session. Please sign in.'))
      }

      // Complete program enrollment
      const result = await joinProgram(activeSession.access_token, program.id)
      setJoined(result.membership)
    } catch (requestError) {
      if (requestError.status === 409 || requestError.code === 'MEMBERSHIP_EXISTS') {
        setAlreadyEnrolled(true)
      } else if (requestError.status === 403 || requestError.code === 'BUSINESS_SUBSCRIPTION_INACTIVE') {
        setAcceptingMemberships(false)
        setError(t('businessNotAccepting', 'This business is currently not accepting new loyalty members.'))
      } else {
        setError(requestError.message)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="app-state"><strong>{t('loadingProgram', 'Loading loyalty program...')}</strong></div>
  if (!program) {
    const isNotFound = loadError?.status === 404 || loadError?.code === 'BUSINESS_NOT_FOUND' || loadError?.code === 'NO_ACTIVE_PROGRAM'
    const isBusinessNotFound = loadError?.code === 'BUSINESS_NOT_FOUND'
    return (
      <div className="app-state">
        <strong>{isBusinessNotFound ? t('businessNotFound', 'Business not found') : isNotFound ? t('programUnavailable', 'Program unavailable') : t('couldNotLoadProgram', 'Could not load program')}</strong>
        <p>{isBusinessNotFound ? t('businessNotFound', 'Business not found') : isNotFound ? t('programUnavailable', 'Program unavailable') : t('serverErrorTryAgain', 'Please try again')}</p>
        {!isNotFound && (
          <button className="primary-button" style={{ marginTop: '12px' }} onClick={retryLoad}>
            {t('tryAgain', 'Try again')}
          </button>
        )}
      </div>
    )
  }

  const isRoleRestricted = session && profile?.role && profile.role !== 'CUSTOMER'
  const activeOffer = (program.rewards || []).find((r) => r.is_active)
  const isPoints = program.model === 'POINTS'
  const unit = isPoints ? t('points', 'points') : t('stamps', 'stamps')

  return (
    <main className="join-page">
      <PreferencesControls />
      <div className="join-card">
        <div className="brand-row auth-brand">
          <div className="brand-mark">
            <Coffee size={18} strokeWidth={2.5} />
          </div>
          <span>loyaltea</span>
        </div>
        <p className="eyebrow">{t('joinCommunity', 'Customer Loyalty Pass')}</p>
        <h1>{program.businesses?.name}</h1>
        <p className="join-program-name">{program.name}</p>

        {/* Active Offer Preview */}
        {activeOffer ? (
          <div className="join-active-offer-card">
            <div className="join-offer-icon">
              <Gift size={20} />
            </div>
            <div className="join-offer-info">
              <strong>{activeOffer.name}</strong>
              <p>{activeOffer.description || t('collectPointsForOffer', 'Earn points with each purchase to unlock this reward')}</p>
              <span className="join-offer-threshold">
                {isPoints ? activeOffer.required_points : activeOffer.required_stamps} {unit} {t('toUnlock', 'required to unlock')}
              </span>
            </div>
          </div>
        ) : (
          <p className="heading-copy">{program.description || t('collectRewards', 'Collect stamps and earn rewards')}</p>
        )}

        {/* Case C & Result: Joined or Already Enrolled */}
        {joined || alreadyEnrolled ? (
          <div className="join-result-container">
            <div className="form-message join-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <CheckCircle2 size={18} />
              <span>{joined ? t('joinSuccess', "You're enrolled in this loyalty program!") : t('alreadyEnrolled', 'You are already enrolled in this loyalty program!')}</span>
            </div>

            {joined?.secure_token && (
              <div className="join-qr-preview" style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <QRCodeSVG
                  value={joined.secure_token}
                  size={140}
                  level="M"
                  includeMargin
                  bgColor="#ffffff"
                  fgColor="#1d3832"
                />
                <span className="qr-touch-label" style={{ marginTop: '8px', fontSize: '11px', color: 'var(--muted)' }}>
                  {t('showAtCounter', 'Show at counter')}
                </span>
              </div>
            )}

            {joined && (
              <div className="join-balance-preview" style={{ margin: '8px 0 12px', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('currentBalance', 'Current Balance')}:</span>{' '}
                <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>
                  {program.model === 'POINTS' ? (joined.points_balance || 0) : (joined.stamps_balance || 0)}{' '}
                  {program.model === 'POINTS' ? t('points', 'points') : t('stamps', 'stamps')}
                </strong>
              </div>
            )}

            <button
              type="button"
              className="primary-button"
              style={{ width: '100%', minHeight: '44px', marginTop: '12px' }}
              onClick={() => window.location.assign('/')}
            >
              {t('viewLoyaltyWallet', 'View in Loyalty Wallet')}
            </button>
          </div>
        ) : session ? (
          /* Authenticated customer ready to join */
          <div className="join-action-box">
            {!acceptingMemberships && (
              <div className="form-message form-message-warning" role="alert">
                {t('businessNotAccepting', 'This business is currently not accepting new loyalty members.')}
              </div>
            )}
            {isRoleRestricted && (
              <div className="form-message form-message-warning" role="alert">
                {t('customerRoleRequired', 'Only customer accounts can enroll in loyalty programs.')}
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            <button
              type="button"
              className="primary-button auth-submit"
              disabled={busy || !acceptingMemberships || isRoleRestricted}
              onClick={handleDirectJoin}
            >
              {busy ? t('joining', 'Joining...') : t('joinProgram', 'Join Loyalty Program')}
            </button>
          </div>
        ) : (
          /* Unauthenticated visitor flow: Case A (Sign-up) or Case B (Sign-in) */
          <form onSubmit={handleAuthAndJoin} className="join-auth-form">
            <div className="join-form-header">
              <div className="auth-tab-switch" role="group">
                <button
                  type="button"
                  className={`auth-tab-btn ${mode === 'sign-up' ? 'active' : ''}`}
                  onClick={() => { setMode('sign-up'); setError(''); onClearError() }}
                >
                  {t('newCustomerSignUp', 'New Customer Sign Up')}
                </button>
                <button
                  type="button"
                  className={`auth-tab-btn ${mode === 'sign-in' ? 'active' : ''}`}
                  onClick={() => { setMode('sign-in'); setError(''); onClearError() }}
                >
                  {t('alreadyHaveAccount', 'Already a Member? Sign In')}
                </button>
              </div>
            </div>

            {!acceptingMemberships && (
              <div className="form-message form-message-warning" role="alert">
                {t('businessNotAccepting', 'This business is currently not accepting new loyalty members.')}
              </div>
            )}

            {/* Case A: Sign up fields (Full name req, Phone req, Email opt, Password req) */}
            {mode === 'sign-up' ? (
              <>
                <label>
                  <span>{t('fullName', 'Full Name')} *</span>
                  <input
                    required
                    value={form.fullName}
                    onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                    placeholder="e.g. Sarah Connor"
                    autoComplete="name"
                  />
                </label>

                <label>
                  <span>{t('phone', 'Phone Number')} *</span>
                  <input
                    required
                    type="tel"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="+213..."
                    autoComplete="tel"
                  />
                </label>

                <label>
                  <span>
                    {t('email', 'Email Address')}{' '}
                    <small style={{ color: 'var(--muted)' }}>({t('optional', 'Optional')})</small>
                  </span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                </label>

                <label>
                  <span>{t('password', 'Password')} (min 8 chars) *</span>
                  <input
                    required
                    minLength={8}
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : (
              /* Case B: Returning customer sign-in */
              <>
                <div className="login-method-control">
                  <div className="auth-method-switch" role="group" aria-label={t('loginMethod', 'Login Method')}>
                    <button
                      type="button"
                      aria-pressed={loginMethod === 'phone'}
                      className={loginMethod === 'phone' ? 'active' : ''}
                      onClick={() => { setLoginMethod('phone'); setError(''); onClearError() }}
                    >
                      {t('phoneLogin', 'Phone Number')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={loginMethod === 'email'}
                      className={loginMethod === 'email' ? 'active' : ''}
                      onClick={() => { setLoginMethod('email'); setError(''); onClearError() }}
                    >
                      {t('emailLogin', 'Email Address')}
                    </button>
                  </div>
                </div>

                {loginMethod === 'phone' ? (
                  <label>
                    <span>{t('phone', 'Phone Number')} *</span>
                    <input
                      required
                      type="tel"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      placeholder="+213..."
                      autoComplete="tel"
                    />
                  </label>
                ) : (
                  <label>
                    <span>{t('email', 'Email Address')} *</span>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      placeholder="name@example.com"
                      autoComplete="email"
                    />
                  </label>
                )}

                <label>
                  <span>{t('password', 'Password')} *</span>
                  <input
                    required
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    autoComplete="current-password"
                  />
                </label>
              </>
            )}

            {error && <p className="form-error">{error}</p>}

            <button
              className="primary-button auth-submit"
              disabled={busy || !acceptingMemberships}
              style={{ minHeight: '46px', marginTop: '16px' }}
            >
              {busy
                ? t('pleaseWait', 'Please wait...')
                : mode === 'sign-up'
                ? t('signUpAndJoin', 'Sign Up & Join')
                : t('signInAndJoin', 'Sign In & Join')}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
