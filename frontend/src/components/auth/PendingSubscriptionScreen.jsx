import { Clock3, LogOut, RefreshCw } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

export default function PendingSubscriptionScreen({ subscription, onRefresh, onSignOut }) {
  const { t } = usePreferences()
  const status = subscription?.status || 'pending'

  const title = status === 'expired'
    ? t('subscriptionExpiredTitle')
    : status === 'suspended'
      ? t('subscriptionSuspendedTitle')
      : t('subscriptionPendingTitle')

  const message = status === 'expired'
    ? t('subscriptionExpiredMessage')
    : status === 'suspended'
      ? t('subscriptionSuspendedMessage')
      : t('subscriptionPendingMessage')

  return (
    <main className="app-state pending-subscription-page">
      <div className="pending-subscription-card">
        <div className="pending-subscription-icon"><Clock3 size={24} /></div>
        <p className="eyebrow">{t('workspace')}</p>
        <h1>{title}</h1>
        <p>{message}</p>
        {subscription?.plan_name && (
          <div className="pending-subscription-summary">
            <span>{t('selectedPlan')}</span>
            <strong>{subscription.plan_name}</strong>
            <small>{subscription.price} {subscription.currency} · {subscription.duration_days} {t('days')}</small>
            <small>{t('status')}: {t(`status${status.charAt(0).toUpperCase()}${status.slice(1)}`)}</small>
          </div>
        )}
        <div className="pending-subscription-actions">
          <button className="primary-button" onClick={onRefresh}>
            <RefreshCw size={15} />{t('checkAgain')}
          </button>
          <button className="text-button" onClick={onSignOut}>
            <LogOut size={15} />{t('signOut')}
          </button>
        </div>
        <PreferencesControls />
      </div>
    </main>
  )
}
