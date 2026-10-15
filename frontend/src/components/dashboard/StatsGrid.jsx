import { Coffee, Gift, Sparkles, Users } from 'lucide-react'
import { usePreferences } from '../../contexts/usePreferences'

const statConfigs = [
  { key: 'customers', labelKey: 'totalCustomers', icon: Users, noteKey: 'liveFromSupabase', style: '', suffix: '' },
  { key: 'issued', labelKey: 'loyaltyIssued', icon: Coffee, noteKey: 'liveTransactionTotal', style: '', suffix: '' },
  { key: 'redeemed', labelKey: 'rewardsRedeemed', icon: Gift, noteKey: 'liveRedemptionTotal', style: '', suffix: '' },
  { key: 'activeRate', labelKey: 'activeMembers', icon: Sparkles, noteKey: 'liveMembershipRate', style: '', suffix: '%' },
]

export default function StatsGrid({ values }) {
  const { t } = usePreferences()

  return (
    <section className="stat-grid" aria-label={t('overview')}>
      {statConfigs.map(({ key, labelKey, icon: Icon, noteKey, style, suffix }) => (
        <article className={`stat-card ${style}`} key={key}>
          <div className="stat-card-top">
            <span>{t(labelKey)}</span>
            <Icon size={18} />
          </div>
          <strong>{values[key] ?? 0}{suffix}</strong>
          <p>
            <span className="positive">{t('live')}</span> · {t(noteKey)}
          </p>
        </article>
      ))}
    </section>
  )
}
