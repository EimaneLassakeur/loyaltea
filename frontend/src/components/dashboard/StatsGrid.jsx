import { Coffee, Gift, Sparkles, Users } from 'lucide-react'
import { usePreferences } from '../../contexts/usePreferences'

const stats = [
  { key: 'customers', label: 'Total customers', icon: Users, note: 'Live from Supabase', style: '', suffix: '' },
  { key: 'issued', label: 'Loyalty issued', icon: Coffee, note: 'Live transaction total', style: '', suffix: '' },
  { key: 'redeemed', label: 'Rewards redeemed', icon: Gift, note: 'Live redemption total', style: '', suffix: '' },
  { key: 'activeRate', label: 'Active members', icon: Sparkles, note: 'Live membership rate', style: '', suffix: '%' },
]

export default function StatsGrid({ values }) {
  const { t } = usePreferences()
  const labels = { customers: t('totalCustomers'), issued: t('loyaltyIssued'), redeemed: t('rewardsRedeemed'), activeRate: t('activeMembers') }
  return <section className="stat-grid" aria-label={t('overview')}>{stats.map(({ key, icon: Icon, note, style, suffix = '' }) => <article className={`stat-card ${style}`} key={key}><div className="stat-card-top"><span>{labels[key]}</span><Icon size={18} /></div><strong>{values[key] ?? 0}{suffix}</strong><p><span className="positive">Live</span> {note.replace('Live ', '')}</p></article>)}</section>
}
