import { Bell, Coffee } from 'lucide-react'

export default function NotificationsPopover({ activities, onClose }) {
  return <aside className="notifications-popover" role="dialog" aria-label="Notifications"><div className="notifications-heading"><div><strong>Notifications</strong><small>Recent workspace activity</small></div><button className="icon-button" onClick={onClose} aria-label="Close notifications">×</button></div>{activities.length === 0 ? <div className="notification-empty"><Bell size={20} /><span>No new activity</span></div> : activities.slice(0, 5).map((activity) => <div className="notification-row" key={`${activity.name}-${activity.time}-${activity.action}`}><div className={`activity-icon ${activity.tone}`}><Coffee size={14} /></div><div><strong>{activity.name}</strong><p>{activity.action}</p><small>{activity.time}</small></div></div>)}</aside>
}
