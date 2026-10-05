import { Bell, Menu } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'

export default function DashboardHeader({ activePage, profile, notificationsOpen, onOpenMenu, onOpenNotifications }) {
  const userInitials = profile?.full_name?.slice(0, 2).toUpperCase() || 'SA'
  return <header className="topbar"><button className="icon-button mobile-menu" onClick={onOpenMenu} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{activePage}</strong></div><div className="topbar-actions"><PreferencesControls compact /><button className={`icon-button ${notificationsOpen ? 'active-icon' : ''}`} onClick={onOpenNotifications} aria-label="Open notifications" title="Open notifications"><Bell size={19} /></button><div className="topbar-avatar">{userInitials}</div></div></header>
}
