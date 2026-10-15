import { Bell, Coffee } from 'lucide-react'
import { usePreferences } from '../../contexts/usePreferences'

export default function NotificationsPopover({ activities, onClose }) {
  const { t } = usePreferences()

  return (
    <aside className="notifications-popover" role="dialog" aria-label={t('notifications')}>
      <div className="notifications-heading">
        <div>
          <strong>{t('notifications')}</strong>
          <small>{t('recentWorkspaceActivity')}</small>
        </div>
        <button className="icon-button" onClick={onClose} aria-label={t('closeNotifications')}>×</button>
      </div>
      {activities.length === 0 ? (
        <div className="notification-empty">
          <Bell size={20} />
          <span>{t('noActivity')}</span>
        </div>
      ) : (
        activities.slice(0, 5).map((activity) => (
          <div className="notification-row" key={`${activity.name}-${activity.time}-${activity.action}`}>
            <div className={`activity-icon ${activity.tone}`}>
              <Coffee size={14} />
            </div>
            <div>
              <strong>{activity.name}</strong>
              <p>{activity.action}</p>
              <small>{activity.time}</small>
            </div>
          </div>
        ))
      )}
    </aside>
  )
}
