import { Gift } from 'lucide-react'
import { usePreferences } from '../../contexts/usePreferences'

export default function RewardsPanel({ program }) {
  const { t } = usePreferences()
  const rewards = (program?.rewards || []).filter((reward) => reward.is_active)
  return <section className="panel rewards-panel"><div className="panel-heading"><div><h2>{t('rewards')}</h2><p>{t('rewardsConfiguredFor')} {program?.name || t('thisProgram')}</p></div><Gift size={19} /></div>{rewards.length === 0 ? <div className="panel-empty"><Gift size={22} /><strong>{t('noRewardsYet')}</strong><span>{t('createRewardApi')}</span></div> : <div className="reward-management-list">{rewards.map((reward) => { const threshold = program?.model === 'POINTS' ? reward.required_points : reward.required_stamps; const unit = program?.model === 'POINTS' ? t('points') : t('stamps'); return <article className="reward-management-row" key={reward.id}><div className="reward-icon"><Gift size={17} /></div><div><strong>{reward.name}</strong><p>{reward.description || t('noDescription')}</p></div><span>{threshold} {unit}</span><small>{reward.expires_at && new Date(reward.expires_at) <= new Date() ? t('expired') : t('active')}</small></article> })}</div>}</section>
}
