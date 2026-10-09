import { useState } from 'react'
import { Coffee } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

const publicSignupEnabled = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === 'true'

export default function AuthScreen({ onSignIn, onSignUp, onClearError, error }) {
  const { t } = usePreferences()
  const [mode, setMode] = useState('sign-in')
  const [loginMethod, setLoginMethod] = useState('phone')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const role = 'CUSTOMER'
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    if (mode === 'sign-in' && loginMethod === 'phone' && !/^\+[1-9]\d{7,14}$/.test(phone.trim().replace(/[\s().-]/g, ''))) {
      setMessage(t('invalidPhone'))
      setBusy(false)
      return
    }
    if (mode === 'sign-up' && !/^\+[1-9]\d{7,14}$/.test(phone.trim().replace(/[\s().-]/g, ''))) {
      setMessage(t('invalidPhone'))
      setBusy(false)
      return
    }
    const result = mode === 'sign-in'
      ? await onSignIn(loginMethod === 'phone' ? phone : email, loginMethod, password)
      : await onSignUp({ phone, email: email || undefined, password, fullName, role })
    if (!result.error && mode === 'sign-up' && !result.data?.session) {
      setMessage(t('checkVerification'))
    } else if (result.error) {
      setMessage('')
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
    <main className="auth-page"><PreferencesControls /><div className="auth-card">
        <div className="brand-row auth-brand"><div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div><span>loyaltea</span></div>
        <p className="eyebrow">{t('digitalLoyalty')}</p>
        <h1>{mode === 'sign-in' ? t('welcomeBack') : t('createWorkspace')}</h1>
        <p className="heading-copy">{mode === 'sign-in' ? t('signInCopy') : t('signUpCopy')}</p>
        <form onSubmit={submit}>
          {mode === 'sign-up' && <>
              <label>{t('fullName')}<input required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
            <label>{t('accountType')}<input value={t('customer')} readOnly /></label>
          </>}
          {mode === 'sign-in' && <div className="auth-method-switch" role="group" aria-label={t('loginMethod')}><button type="button" className={loginMethod === 'phone' ? 'active' : ''} onClick={() => setLoginMethod('phone')}>{t('phoneLogin')}</button><button type="button" className={loginMethod === 'email' ? 'active' : ''} onClick={() => setLoginMethod('email')}>{t('emailLogin')}</button></div>}
          {(mode === 'sign-up' || loginMethod === 'phone') && <label>{t('phone')}<input required={mode === 'sign-up' || loginMethod === 'phone'} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+213..." /></label>}
          {(mode === 'sign-up' || loginMethod === 'email') && <label>{t('email')}{mode === 'sign-up' && <small>{t('optional')}</small>}<input required={mode === 'sign-in' && loginMethod === 'email'} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
          <label>{t('password')}<input required minLength="8" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {(error || message) && <p className={error ? 'form-error' : 'form-message'}>{error || message}</p>}
          <button className="primary-button auth-submit" disabled={busy}>{busy ? t('pleaseWait') : mode === 'sign-in' ? t('signIn') : t('signUp')}</button>
        </form>
        {publicSignupEnabled && <button className="text-button auth-switch" onClick={switchMode}>{mode === 'sign-in' ? t('signUp') : t('signIn')}</button>}
      </div>
    </main>
  )
}
