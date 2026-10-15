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
          setMessage(t('invalidPhone'))
          setBusy(false)
          return
        }
      } else {
        identifier = normalizeEmail(email)
        if (!identifier) {
          setMessage(t('invalidEmail'))
          setBusy(false)
          return
        }
      }

      const result = await onSignIn(identifier, loginMethod, password)
      if (result.error) {
        if (result.error.code === 'PHONE_PROVIDER_DISABLED') {
          setMessage(t('phoneProviderDisabled'))
        }
      } else if (result.data?.session) {
        handleSuccessfulAuth()
      }
      setBusy(false)
      return
    }

    // Sign-up mode
    const normEmail = normalizeEmail(email)
    if (!normEmail) {
      setMessage(t('invalidEmail'))
      setBusy(false)
      return
    }
    const normPhone = phone ? normalizePhone(phone) : ''
    if (phone && !normPhone) {
      setMessage(t('invalidPhone'))
      setBusy(false)
      return
    }

    const result = await onSignUp({
      email: normEmail,
      phone: normPhone || undefined,
      password,
      fullName: fullName.trim(),
      role,
    })

    if (!result.error && !result.data?.session) {
      setMessage(t('checkVerification'))
    } else if (!result.error && result.data?.session) {
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
          <div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div>
          <span>loyaltea</span>
        </div>
        <p className="eyebrow">{t('digitalLoyalty')}</p>
        <h1>{mode === 'sign-in' ? t('welcomeBack') : t('signUp')}</h1>
        <p className="heading-copy">{mode === 'sign-in' ? t('signInCopy') : t('collectRewards')}</p>
        <form onSubmit={submit}>
          {mode === 'sign-up' && (
            <>
              <label>
                {t('fullName')}
                <input required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
              <label>
                {t('accountType')}
                <input value={t('customer')} readOnly />
              </label>
            </>
          )}

          {mode === 'sign-in' && (
            <div className="login-method-control">
              <span className="login-method-label">{t('loginMethod')}</span>
              <div className="auth-method-switch" role="group" aria-label={t('loginMethod')}>
                <button
                  type="button"
                  aria-pressed={loginMethod === 'email'}
                  className={loginMethod === 'email' ? 'active' : ''}
                  onClick={() => { setLoginMethod('email'); setMessage(''); onClearError() }}
                >
                  {t('emailLogin')}
                </button>
                <button
                  type="button"
                  aria-pressed={loginMethod === 'phone'}
                  className={loginMethod === 'phone' ? 'active' : ''}
                  onClick={() => { setLoginMethod('phone'); setMessage(''); onClearError() }}
                >
                  {t('phoneLogin')}
                </button>
              </div>
              <small className="login-method-hint">{loginMethod === 'phone' ? t('phoneLogin') : t('emailLogin')}</small>
            </div>
          )}

          {(mode === 'sign-up' || loginMethod === 'email') && (
            <label>
              {t('email')}
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            />
          </label>

          {(error || message) && <p className={error ? 'form-error' : 'form-message'}>{error || message}</p>}

          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? t('pleaseWait') : mode === 'sign-in' ? t('signIn') : t('signUp')}
          </button>
        </form>

        {publicSignupEnabled && (
          <button className="text-button auth-switch" onClick={switchMode}>
            {mode === 'sign-in' ? t('signUp') : t('signIn')}
          </button>
        )}
      </div>
    </main>
  )
}
