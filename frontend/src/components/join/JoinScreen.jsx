import { useEffect, useState } from 'react'
import { Coffee, Gift } from 'lucide-react'
import { getPublicProgram, joinProgram } from '../../services/dashboardService'
import PreferencesControls from '../PreferencesControls'

const publicSignupEnabled = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === 'true'

export default function JoinScreen({ programId, session, onSignIn, onSignUp, onClearError }) {
  const [program, setProgram] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('sign-in')
  const [loginMethod, setLoginMethod] = useState('phone')
  const [form, setForm] = useState({ phone: '', email: '', password: '', fullName: '' })

  useEffect(() => {
    getPublicProgram(programId).then((result) => setProgram(result.program)).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
  }, [programId])

  const authenticateAndJoin = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      let activeSession = session
      if (!activeSession) {
        const result = mode === 'sign-in'
          ? await onSignIn(loginMethod === 'phone' ? form.phone : form.email, loginMethod, form.password)
          : await onSignUp({ phone: form.phone, email: form.email || undefined, password: form.password, fullName: form.fullName, role: 'CUSTOMER' })
        if (result.error) throw result.error
        activeSession = result.data?.session
        if (!activeSession) throw new Error('Check your email to confirm your account, then open this join link again.')
      }
      const result = await joinProgram(activeSession.access_token, programId)
      setJoined(result.membership)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="app-state"><strong>Loading program...</strong></div>
  if (!program) return <div className="app-state"><strong>Program unavailable</strong><p>{error}</p></div>

  return (
    <main className="join-page"><PreferencesControls /><div className="join-card">
        <div className="brand-row auth-brand"><div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div><span>loyaltea</span></div>
        <p className="eyebrow">Join the community</p>
        <h1>{program.businesses?.name}</h1>
        <p className="join-program-name">{program.name}</p>
        <p className="heading-copy">{program.description || 'Collect loyalty rewards every time you visit.'}</p>
        <div className="join-reward-list">{(program.rewards || []).filter((reward) => reward.is_active).map((reward) => <div className="join-reward" key={reward.id}><Gift size={18} /><div><strong>{reward.name}</strong><small>Unlock at {program.model === 'STAMPS' ? reward.required_stamps : reward.required_points} {program.model.toLowerCase()}</small></div></div>)}</div>
        {joined ? <div className="form-message join-success">You joined successfully. Your membership card is ready in your account.</div> : <form onSubmit={authenticateAndJoin}>
          {!session && mode === 'sign-up' && <label>Full name<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>}
          {!session && <div className="auth-method-switch" role="group" aria-label="Login method"><button type="button" className={loginMethod === 'phone' ? 'active' : ''} onClick={() => setLoginMethod('phone')}>Phone</button><button type="button" className={loginMethod === 'email' ? 'active' : ''} onClick={() => setLoginMethod('email')}>Email</button></div>}
          {(mode === 'sign-up' || loginMethod === 'phone') && <label>Phone<input required={mode === 'sign-up' || loginMethod === 'phone'} type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+213..." /></label>}
          {(mode === 'sign-up' || loginMethod === 'email') && <label>Email{mode === 'sign-up' && <small>optional</small>}<input required={mode === 'sign-in' && loginMethod === 'email'} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>}
          <label>Password<input required minLength="8" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Joining...' : session ? 'Join program' : mode === 'sign-in' ? 'Sign in and join' : 'Create account and join'}</button>
        </form>}
        {!session && publicSignupEnabled && !joined && <button className="text-button auth-switch" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(''); onClearError() }}>{mode === 'sign-in' ? 'New here? Create a customer account' : 'Already have an account? Sign in'}</button>}
      </div>
    </main>
  )
}
