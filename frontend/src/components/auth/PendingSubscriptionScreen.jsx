import { Clock3, LogOut, RefreshCw } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

export default function PendingSubscriptionScreen({ subscription, onRefresh, onSignOut }) {
  const { t } = usePreferences()
  const status = subscription?.status || 'pending'
  return (
    <main className="app-state pending-subscription-page">
      <div className="pending-subscription-card">
        <div className="pending-subscription-icon"><Clock3 size={24} /></div>
        <p className="eyebrow">Loyaltea workspace</p>
        <h1>Subscription {status}</h1>
        <p>Your business account has been created. A platform administrator must confirm the subscription payment before dashboard features are enabled.</p>
        {subscription?.plan_name && <div className="pending-subscription-summary"><span>Selected plan</span><strong>{subscription.plan_name}</strong><small>{subscription.price} {subscription.currency} · {subscription.duration_days} days</small><small>Status: {status}</small></div>}
        <div className="pending-subscription-actions"><button className="primary-button" onClick={onRefresh}><RefreshCw size={15} />Check again</button><button className="text-button" onClick={onSignOut}><LogOut size={15} />{t('signOut')}</button></div>
        <PreferencesControls />
      </div>
    </main>
  )
}
