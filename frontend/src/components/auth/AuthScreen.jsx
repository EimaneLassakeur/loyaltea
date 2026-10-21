import { useEffect, useState } from 'react'
import { Coffee } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'
import { normalizeEmail, normalizePhone } from '../../lib/authUtils'

const publicSignupEnabled = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === 'true'

export default function AuthScreen({ onSignIn, onSignUp, onClearError, error }) {
  const { t } = usePreferences()
  const [mode, setMode] = useState('sign-in')
  const [loginMethod, setLoginMethod] = useState('email')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const role = 'CUSTOMER'
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo')
    if (returnTo && returnTo.startsWith('/')) {
      sessionStorage.setItem('loyaltea.return_to', returnTo)
    }
  }, [])

  const handleSuccessfulAuth = () => {
    const returnTo = sessionStorage.getItem('loyaltea.return_to') || new URLSearchParams(window.location.search).get('returnTo')
    if (returnTo && returnTo.startsWith('/')) {
      sessionStorage.removeItem('loyaltea.return_to')
      window.location.assign(returnTo)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    onClearError()

    if (mode === 'sign-in') {
      let identifier = ''
      if (loginMethod === 'phone') {
        identifier = normalizePhone(phone)
        if (!identifier) {
          setMessage(t('invalidPhone', 'A valid phone number is required'))
          setBusy(false)
          return
        }
      } else {
        identifier = normalizeEmail(email)
        if (!identifier) {
          setMessage(t('invalidEmail', 'Please enter a valid email address'))
          setBusy(false)
          return
        }
      }

      const result = await onSignIn(identifier, loginMethod, password)
      if (result.error) {
        if (result.error.code === 'PHONE_PROVIDER_DISABLED') {
          setMessage(t('phoneProviderDisabled', 'Phone login unavailable'))
        }
      } else if (result.data?.session) {
        handleSuccessfulAuth()
      }
      setBusy(false)
      return
    }

    // Sign-up mode: Full name req, Phone req, Email opt, Password req
    const normPhone = normalizePhone(phone)
    if (!normPhone) {
      setMessage(t('invalidPhone', 'A valid phone number is required'))
      setBusy(false)
      return
    }
    const normEmail = email ? normalizeEmail(email) : ''
    if (email && !normEmail) {
      setMessage(t('invalidEmail', 'Please enter a valid email address'))
      setBusy(false)
      return
    }
    if (!fullName || !fullName.trim()) {
      setMessage(t('fullNameRequired', 'Full name is required'))
      setBusy(false)
      return
    }
    if (!password || password.length < 8) {
      setMessage(t('passwordMinLength', 'Password must be at least 8 characters'))
      setBusy(false)
      return
    }

    const result = await onSignUp({
      phone: normPhone,
      email: normEmail || undefined,
      password,
      fullName: fullName.trim(),
      role,
    })

    if (result.error) {
      setMessage(result.error.message)
    } else if (result.data?.session) {
      handleSuccessfulAuth()
    }
    setBusy(false)
  }

  const switchMode = () => {
    if (!publicSignupEnabled) return
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
    setMessage('')
    setPhone('')
    setEmail('')
    setPassword('')
    setFullName('')
    onClearError()
  }

  return (
    <main className="auth-page">
      <PreferencesControls />
      <div className="auth-card">
        <div className="brand-row auth-brand">
          <div className="brand-mark">
            <Coffee size={18} strokeWidth={2.5} />
          </div>
          <span>loyaltea</span>
        </div>
        <p className="eyebrow">{t('digitalLoyalty', 'Digital Loyalty Platform')}</p>
        <h1>{mode === 'sign-in' ? t('welcomeBack', 'Welcome back') : t('signUp', 'Create your Account')}</h1>
        <p className="heading-copy">
          {mode === 'sign-in' ? t('signInCopy', 'Sign in to access your loyalty wallet') : t('collectRewards', 'Collect stamps and earn rewards')}
        </p>

        <form onSubmit={submit}>
          {mode === 'sign-up' && (
            <>
              <label>
                <span>{t('fullName', 'Full Name')} *</span>
                <input
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="e.g. Sarah Connor"
                  autoComplete="name"
                />
              </label>

              <label>
                <span>{t('phone', 'Phone Number')} *</span>
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
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
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </label>
            </>
          )}

          {mode === 'sign-in' && (
            <div className="login-method-control">
              <span className="login-method-label">{t('loginMethod', 'Login Method')}</span>
              <div className="auth-method-switch" role="group" aria-label={t('loginMethod', 'Login Method')}>
                <button
                  type="button"
                  aria-pressed={loginMethod === 'email'}
                  className={loginMethod === 'email' ? 'active' : ''}
                  onClick={() => { setLoginMethod('email'); setMessage(''); onClearError() }}
                >
                  {t('emailLogin', 'Email Address')}
                </button>
                <button
                  type="button"
                  aria-pressed={loginMethod === 'phone'}
                  className={loginMethod === 'phone' ? 'active' : ''}
                  onClick={() => { setLoginMethod('phone'); setMessage(''); onClearError() }}
                >
                  {t('phoneLogin', 'Phone Number')}
                </button>
              </div>
            </div>
          )}

          {mode === 'sign-in' && loginMethod === 'email' && (
            <label>
              <span>{t('email', 'Email Address')} *</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
              />
            </label>
          )}

          {mode === 'sign-in' && loginMethod === 'phone' && (
            <label>
              <span>{t('phone', 'Phone Number')} *</span>
              <input
                required
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+213..."
                autoComplete="tel"
              />
            </label>
          )}

          <label>
            <span>{t('password', 'Password')} *</span>
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            />
          </label>

          {(error || message) && <p className={error ? 'form-error' : 'form-message'}>{error || message}</p>}

          <button className="primary-button auth-submit" disabled={busy} style={{ minHeight: '44px', marginTop: '14px' }}>
            {busy ? t('pleaseWait', 'Please wait...') : mode === 'sign-in' ? t('signIn', 'Sign In') : t('signUp', 'Create Account')}
          </button>
        </form>

        {publicSignupEnabled && (
          <button className="text-button auth-switch" onClick={switchMode} style={{ marginTop: '16px' }}>
            {mode === 'sign-in' ? t('noAccountSignUp', "Don't have an account? Sign up") : t('alreadyHaveAccountSignIn', 'Already have an account? Sign in')}
          </button>
        )}
      </div>
    </main>
  )
}
