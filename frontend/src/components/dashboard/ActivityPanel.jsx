import { Coffee } from 'lucide-react'
import { usePreferences } from '../../contexts/usePreferences'

export default function ActivityPanel({ activities }) {
  const { t } = usePreferences()
  return <article className="panel activity-panel"><div className="panel-heading"><div><h2>{t('recentActivity')}</h2><p>{t('latestMemberUpdates')}</p></div></div><div className="activity-list">{activities.length === 0 ? <div className="panel-empty"><Coffee size={22} /><strong>{t('noActivity')}</strong><span>{t('activityWillAppear')}</span></div> : activities.map(({ name, action, time, tone }) => <div className="activity-item" key={`${name}-${time}`}><div className={`activity-icon ${tone}`}><Coffee size={16} /></div><div><strong>{name}</strong><p>{action}</p></div><time>{time}</time></div>)}</div></article>
}
