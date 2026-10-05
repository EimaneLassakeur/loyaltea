import { ChevronDown, Coffee, Ellipsis, Gift, LayoutDashboard, BarChart3, Users, X } from 'lucide-react'
import { useState } from 'react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

const navItems = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'rewards', label: 'Rewards', icon: Gift },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
]

export default function DashboardSidebar({ activePage, isOpen, profile, business, businesses, selectedBusinessId, customerCount, onBusinessChange, onNavigate, onClose, onSignOut }) {
  const location = business?.business_locations?.find((item) => item.is_active)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const { t } = usePreferences()
  return <aside className={`sidebar ${isOpen ? 'is-open' : ''}`}>
    <div className="brand-row"><div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div><span>loyaltea</span><button className="icon-button close-nav" onClick={onClose} aria-label="Close navigation"><X size={18} /></button></div>
    <div className="workspace-switcher"><div className="workspace-avatar">{business?.name?.slice(0, 1).toUpperCase() || 'W'}</div><div className="workspace-details"><strong>{business?.name || 'Workspace'}</strong><small>{location?.address || location?.name || 'No active location'}</small></div><select value={selectedBusinessId} onChange={(event) => onBusinessChange(event.target.value)} aria-label="Select business workspace"><option value="" disabled>Select workspace</option>{(businesses || []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></div>
    <nav className="main-nav" aria-label="Main navigation"><span className="nav-label">{t('dashboard')}</span>{navItems.map(({ key, label, icon: Icon }) => <button key={label} className={`nav-item ${activePage === label ? 'active' : ''}`} onClick={() => onNavigate(label)}><Icon size={18} />{t(key)}{label === 'Customers' && <span className="nav-count">{customerCount || 0}</span>}</button>)}</nav>
    <div className="sidebar-bottom"><PreferencesControls compact /><div className="profile-row"><div className="profile-avatar">{profile?.full_name?.slice(0, 2).toUpperCase() || 'SA'}</div><div><strong>{profile?.full_name || 'Workspace member'}</strong><small>{profile?.role || 'Member'}</small></div><button className="icon-button" onClick={() => setProfileMenuOpen((isOpen) => !isOpen)} aria-label="Open profile menu" title="Open profile menu"><Ellipsis size={18} /></button>{profileMenuOpen && <div className="profile-popover"><strong>{profile?.full_name || 'Workspace member'}</strong><small>{profile?.role || 'Member'}</small><button className="text-button" onClick={onSignOut}>Sign out</button></div>}</div></div>
  </aside>
}
