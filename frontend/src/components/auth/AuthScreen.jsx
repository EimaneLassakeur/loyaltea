import { useState } from 'react'
import { Coffee } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

export default function AuthScreen({ onSignIn, onSignUp, onClearError, error }) {
  const { t } = usePreferences()
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('BUSINESS_OWNER')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const result = mode === 'sign-in'
      ? await onSignIn(email, password)
      : await onSignUp({ email, password, fullName, role })
    if (!result.error && mode === 'sign-up' && !result.data?.session) {
      setMessage('Check your email to confirm your account.')
    } else if (result.error) {
      setMessage('')
    }
    setBusy(false)
  }

  const switchMode = () => {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
    setMessage('')
    setEmail('')
    setPassword('')
    setFullName('')
    onClearError()
  }

  return (
    <main className="auth-page"><PreferencesControls /><div className="auth-card">
        <div className="brand-row auth-brand"><div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div><span>loyaltea</span></div>
        <p className="eyebrow">Digital loyalty, made simple</p>
        <h1>{mode === 'sign-in' ? t('welcomeBack') : t('createWorkspace')}</h1>
        <p className="heading-copy">{mode === 'sign-in' ? t('signInCopy') : t('signUpCopy')}</p>
        <form onSubmit={submit}>
          {mode === 'sign-up' && <>
            <label>{t('fullName')}<input required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
            <label>{t('accountType')}<select value={role} onChange={(event) => setRole(event.target.value)}><option value="BUSINESS_OWNER">{t('businessOwner')}</option><option value="CUSTOMER">{t('customer')}</option></select></label>
          </>}
          <label>{t('email')}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>{t('password')}<input required minLength="8" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {(error || message) && <p className={error ? 'form-error' : 'form-message'}>{error || message}</p>}
          <button className="primary-button auth-submit" disabled={busy}>{busy ? t('pleaseWait') : mode === 'sign-in' ? t('signIn') : t('signUp')}</button>
        </form>
        <button className="text-button auth-switch" onClick={switchMode}>{mode === 'sign-in' ? t('signUp') : t('signIn')}</button>
      </div>
    </main>
  )
}
