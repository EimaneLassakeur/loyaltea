import { Bell, Menu } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

export default function DashboardHeader({ activePage, profile, notificationsOpen, onOpenMenu, onOpenNotifications }) {
  const { t } = usePreferences()
  const userInitials = profile?.full_name?.slice(0, 2).toUpperCase() || 'SA'
  const pageKey = typeof activePage === 'string' ? activePage.toLowerCase() : 'overview'

  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" onClick={onOpenMenu} aria-label={t('openNavigation')}>
        <Menu size={20} />
      </button>
      <div className="breadcrumbs">
        <span>{t('workspace')}</span>
        <span>/</span>
        <strong>{t(pageKey)}</strong>
      </div>
      <div className="topbar-actions">
        <PreferencesControls compact />
        <button
          className={`icon-button ${notificationsOpen ? 'active-icon' : ''}`}
          onClick={onOpenNotifications}
          aria-label={t('openNotifications')}
          title={t('openNotifications')}
        >
          <Bell size={19} />
        </button>
        <div className="topbar-avatar">{userInitials}</div>
      </div>
    </header>
  )
}
