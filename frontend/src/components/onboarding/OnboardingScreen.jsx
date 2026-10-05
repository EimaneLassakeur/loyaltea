import { useState } from 'react'
import { Coffee } from 'lucide-react'
import { createWorkspace } from '../../services/dashboardService'
import PreferencesControls from '../PreferencesControls'

export default function OnboardingScreen({ accessToken, onComplete }) {
  const [form, setForm] = useState({ businessName: '', locationName: '', address: '', programName: 'My loyalty program', model: 'STAMPS', pointsPerCurrency: '0.01', threshold: '10', rewardName: 'Free reward', rewardDescription: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createWorkspace(accessToken, { businessName: form.businessName, slug: form.businessName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), locationName: form.locationName, address: form.address, programName: form.programName, model: form.model, pointsPerCurrency: form.model === 'POINTS' ? Number(form.pointsPerCurrency) : null, currencyUnit: 'DZD', rewardName: form.rewardName, rewardDescription: form.rewardDescription, threshold: Number(form.threshold) })
      await onComplete()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page"><PreferencesControls /><div className="auth-card onboarding-card">
        <div className="brand-row auth-brand"><div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div><span>loyaltea</span></div>
        <p className="eyebrow">Welcome to Loyaltea</p>
        <h1>Set up your first program</h1>
        <p className="heading-copy">Create the basics now. You can manage everything else from your workspace.</p>
        <form onSubmit={submit}>
          <label>Business name<input required value={form.businessName} onChange={(event) => update('businessName', event.target.value)} placeholder="Morning Rituals" /></label>
          <label>First location<input required value={form.locationName} onChange={(event) => update('locationName', event.target.value)} placeholder="Downtown" /></label>
          <label>Address<input value={form.address} onChange={(event) => update('address', event.target.value)} placeholder="Algiers, Algeria" /></label>
          <label>Program name<input required value={form.programName} onChange={(event) => update('programName', event.target.value)} /></label>
          <label>Loyalty model<select value={form.model} onChange={(event) => update('model', event.target.value)}><option value="STAMPS">Stamps</option><option value="POINTS">Points</option></select></label>
          {form.model === 'POINTS' && <label>Points per DZD<input required min="0.0001" step="0.0001" type="number" value={form.pointsPerCurrency} onChange={(event) => update('pointsPerCurrency', event.target.value)} /></label>}
          <label>Reward threshold<input required min="1" type="number" value={form.threshold} onChange={(event) => update('threshold', event.target.value)} /></label>
          <label>First reward<input required value={form.rewardName} onChange={(event) => update('rewardName', event.target.value)} /></label>
          <label>Reward description<input value={form.rewardDescription} onChange={(event) => update('rewardDescription', event.target.value)} placeholder="A complimentary drink" /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Creating workspace...' : 'Create workspace'}</button>
        </form>
      </div>
    </main>
  )
}
