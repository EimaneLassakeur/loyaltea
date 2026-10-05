import { Coffee, BarChart3, Users, LogOut, Activity, Store, UserRound, ArrowUpRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

export default function PlatformAdminScreen({ session, profile, onSignOut }) {
  const { t, language } = usePreferences()
  const [businesses, setBusinesses] = useState([])
  const [totals, setTotals] = useState({ businesses: 0, activePrograms: 0, customers: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('Dashboard')
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [businessSearch, setBusinessSearch] = useState('')

  const filteredBusinesses = useMemo(() => businesses.filter((business) => `${business.name} ${business.slug}`.toLowerCase().includes(businessSearch.toLowerCase())), [businesses, businessSearch])
  const formatDate = (value) => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(value))

  useEffect(() => {
    const loadBusinesses = async () => {
      try {
        setLoading(true)
        const result = await apiFetch('/api/admin/overview', session.access_token)
        setBusinesses(result.businesses || [])
        setTotals(result.totals || { businesses: 0, activePrograms: 0, customers: 0 })
        setError('')
      } catch (err) {
        setError(err.message)
        setBusinesses([])
      } finally {
        setLoading(false)
      }
    }

    loadBusinesses()
  }, [session.access_token])

  if (loading) {
    return (
      <div className="app-state">
        <strong>Loading admin dashboard...</strong>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div>
          <span>loyaltea</span>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-avatar">A</div>
          <div>
            <strong>{t('platformAdmin')}</strong>
            <small>{t('systemAdministrator')}</small>
          </div>
        </div>
        <nav className="main-nav" aria-label={t('adminNavigation')}>
          <span className="nav-label">{t('administration')}</span>
          <button className={`nav-item ${activeView === 'Dashboard' ? 'active' : ''}`} onClick={() => setActiveView('Dashboard')}>
            <BarChart3 size={18} />{t('dashboard')}
          </button>
          <button className={`nav-item ${activeView === 'Businesses' ? 'active' : ''}`} onClick={() => setActiveView('Businesses')}>
            <Users size={18} />{t('businesses')}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-row">
            <div className="profile-avatar">
              {profile?.full_name?.slice(0, 2).toUpperCase() || 'AD'}
            </div>
            <div>
              <strong>{profile?.full_name || 'Admin'}</strong>
              <small>{t('platformAdmin')}</small>
            </div>
          </div>
          <button className="text-button" onClick={onSignOut} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LogOut size={16} />{t('signOut')}
          </button>
          <PreferencesControls compact />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>{t('administration')}</span><span>/</span><strong>{activeView === 'Dashboard' ? t('dashboard') : t('businesses')}</strong></div>
          <div className="topbar-actions"><PreferencesControls compact /><div className="topbar-avatar">{profile?.full_name?.slice(0, 2).toUpperCase() || 'AD'}</div></div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div><p className="eyebrow">{t('platformOverview')}</p><h1>{activeView === 'Dashboard' ? t('adminDashboardTitle') : t('businessDirectoryTitle')}</h1><p className="heading-copy">{activeView === 'Dashboard' ? t('adminDashboardCopy') : t('businessDirectoryCopy')}</p></div>
            <div className="heading-actions"><button className="secondary-button" onClick={() => window.location.reload()}><Activity size={15} />{t('refreshData')}</button></div>
          </section>
          {activeView === 'Dashboard' && <>
          <div className="stat-grid admin-stat-grid">
              <div className="stat-card"><div className="stat-card-top"><span>{t('totalBusinesses')}</span><Store size={18} /></div><strong>{totals.businesses}</strong><p>{t('registeredBusinesses')}</p></div>
              <div className="stat-card"><div className="stat-card-top"><span>{t('activePrograms')}</span><Activity size={18} /></div><strong>{totals.activePrograms}</strong><p>{t('runningLoyaltyPrograms')}</p></div>
              <div className="stat-card"><div className="stat-card-top"><span>{t('totalCustomers')}</span><UserRound size={18} /></div><strong>{totals.customers}</strong><p>{t('membersAcrossBusinesses')}</p></div>
              <div className="stat-card accent-card"><div className="stat-card-top"><span>{t('totalTransactions')}</span><ArrowUpRight size={18} /></div><strong>{totals.transactions || 0}</strong><p>{t('loyaltyEventsRecorded')}</p></div>
          </div>
          <section className="content-grid admin-insight-grid">
            <article className="panel info-panel"><div className="panel-heading"><div><h2>{t('platformHealth')}</h2><p>{t('platformHealthCopy')}</p></div><span className="status-indicator" /></div><div className="settings-list"><div><span>{t('apiStatus')}</span><strong>{t('connected')}</strong></div><div><span>{t('dataScope')}</span><strong>{t('allBusinesses')}</strong></div><div><span>{t('businessesWithPrograms')}</span><strong>{businesses.filter((business) => business.active_programs > 0).length}</strong></div><div><span>{t('averageCustomers')}</span><strong>{totals.businesses ? Math.round(totals.customers / totals.businesses) : 0}</strong></div></div></article>
            <article className="panel info-panel"><div className="panel-heading"><div><h2>{t('quickActions')}</h2><p>{t('quickActionsCopy')}</p></div></div><div className="lookup-actions"><button className="secondary-button" onClick={() => setActiveView('Businesses')}><Users size={15} />{t('reviewBusinesses')}</button><button className="secondary-button" onClick={() => window.location.reload()}><Activity size={15} />{t('reloadOverview')}</button></div></article>
          </section>
          </>}
          {activeView === 'Businesses' && <section className="panel customers-panel"><div className="panel-heading"><div><h2>{t('managedBusinesses')}</h2><p>{t('managedBusinessesCopy')}</p></div></div><div className="customer-toolbar"><label className="search-box"><Users size={15} /><input value={businessSearch} onChange={(event) => setBusinessSearch(event.target.value)} placeholder={t('searchBusinesses')} /></label><span className="heading-copy">{filteredBusinesses.length} / {businesses.length}</span></div>
            <div className="customer-table"><div className="table-row table-header"><span>{t('businessName')}</span><span>{t('slug')}</span><span>{t('programs')}</span><span>{t('customers')}</span><span>{t('action')}</span></div>{filteredBusinesses.map((business) => <div className="table-row" key={business.id}><strong>{business.name}</strong><span>{business.slug}</span><span>{business.active_programs}</span><span>{business.customers}</span><button className="secondary-button" onClick={() => setSelectedBusiness(business)}>{t('view')}</button></div>)}</div>
            {!filteredBusinesses.length && <div className="panel-empty"><Store size={24} /><strong>{t('noBusinessesFound')}</strong><span>{t('noBusinessesFoundCopy')}</span></div>}
          </section>}
          {error && <p className="form-error">{t('loadError')}: {error}</p>}
          {selectedBusiness && <section className="panel info-panel" style={{ marginTop: '14px' }}><div className="panel-heading"><div><h2>{selectedBusiness.name}</h2><p>{selectedBusiness.slug}</p></div><button className="text-button" onClick={() => setSelectedBusiness(null)}>{t('closeDetails')}</button></div><div className="settings-list"><div><span>{t('created')}</span><strong>{formatDate(selectedBusiness.created_at)}</strong></div><div><span>{t('programs')}</span><strong>{selectedBusiness.active_programs}</strong></div><div><span>{t('customers')}</span><strong>{selectedBusiness.customers}</strong></div><div><span>{t('transactions')}</span><strong>{selectedBusiness.transactions}</strong></div></div></section>}

          <footer className="page-footer" style={{ marginTop: '40px' }}>
            <span><span className="status-indicator" /> {t('apiConnected')}</span>
            <span>{t('platformAdministrator')}</span>
            <button className="text-button" onClick={onSignOut}>{t('signOut')}</button>
          </footer>
        </div>
      </main>
    </div>
  )
}
