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
  const [subscriptionByBusiness, setSubscriptionByBusiness] = useState({})
  const [renewalForm, setRenewalForm] = useState({ planId: '', amount: '', receivedAt: '', reference: '', notes: '' })
  const [renewalMessage, setRenewalMessage] = useState('')
  const [plans, setPlans] = useState([])
  const [showProvisionForm, setShowProvisionForm] = useState(false)
  const [provisionForm, setProvisionForm] = useState({ businessName: '', slug: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '', planId: '' })
  const [provisionMessage, setProvisionMessage] = useState('')

  const filteredBusinesses = useMemo(() => businesses.filter((business) => `${business.name} ${business.slug}`.toLowerCase().includes(businessSearch.toLowerCase())), [businesses, businessSearch])
  const formatDate = (value) => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(value))

  useEffect(() => {
    const loadBusinesses = async () => {
      try {
        setLoading(true)
        const [result, plansResult] = await Promise.all([
          apiFetch('/api/admin/overview', session.access_token),
          apiFetch('/api/admin/subscription-plans', session.access_token),
        ])
        setBusinesses(result.businesses || [])
        setPlans(plansResult.plans || [])
        setTotals(result.totals || { businesses: 0, activePrograms: 0, customers: 0 })
        const subscriptionEntries = await Promise.all((result.businesses || []).map(async (business) => {
          try {
            const subscriptionResult = await apiFetch(`/api/businesses/${business.id}/subscription`, session.access_token)
            return [business.id, subscriptionResult.subscription]
          } catch {
            return [business.id, null]
          }
        }))
        setSubscriptionByBusiness(Object.fromEntries(subscriptionEntries))
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
          {activeView === 'Businesses' && <section className="panel customers-panel"><div className="panel-heading"><div><h2>{t('managedBusinesses')}</h2><p>{t('managedBusinessesCopy')}</p></div><button className="primary-button" onClick={() => { setShowProvisionForm((visible) => !visible); setProvisionMessage('') }}><Store size={15} />{showProvisionForm ? 'Close form' : 'Create business'}</button></div>{showProvisionForm && <form className="provision-form" onSubmit={async (event) => { event.preventDefault(); setProvisionMessage(''); try { const result = await apiFetch('/api/admin/businesses/provision', session.access_token, { method: 'POST', body: JSON.stringify(provisionForm) }); setBusinesses((current) => [{ ...result.business, active_programs: 0, customers: 0, transactions: 0, redemptions: 0 }, ...current]); setSubscriptionByBusiness((current) => ({ ...current, [result.business.id]: result.subscription })); setProvisionForm({ businessName: '', slug: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '', planId: '' }); setProvisionMessage('Business created with a pending subscription. Record payment after receiving cash.'); } catch (err) { setProvisionMessage(err.message) } }}><div className="provision-form-heading"><div><h3>Create business account</h3><p>Creates the business, owner login, and a pending subscription together.</p></div><span className="renewal-badge">Pending until paid</span></div><div className="provision-fields"><label>Business name<input required value={provisionForm.businessName} onChange={(event) => setProvisionForm({ ...provisionForm, businessName: event.target.value })} /></label><label>Business slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={provisionForm.slug} onChange={(event) => setProvisionForm({ ...provisionForm, slug: event.target.value.toLowerCase() })} /></label><label>Owner full name<input required value={provisionForm.ownerFullName} onChange={(event) => setProvisionForm({ ...provisionForm, ownerFullName: event.target.value })} /></label><label>Owner email<input type="email" value={provisionForm.ownerEmail} onChange={(event) => setProvisionForm({ ...provisionForm, ownerEmail: event.target.value })} /></label><label>Owner phone<input type="tel" placeholder="+213..." value={provisionForm.ownerPhone} onChange={(event) => setProvisionForm({ ...provisionForm, ownerPhone: event.target.value })} /></label><label>Temporary password<input required minLength="8" type="password" value={provisionForm.ownerPassword} onChange={(event) => setProvisionForm({ ...provisionForm, ownerPassword: event.target.value })} /></label><label className="plan-field">Subscription plan<select required value={provisionForm.planId} onChange={(event) => setProvisionForm({ ...provisionForm, planId: event.target.value })}><option value="">Select a plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.price} {plan.currency} / {plan.duration_days} days</option>)}</select></label></div><button className="primary-button" type="submit">Create pending business</button>{provisionMessage && <p className={provisionMessage.includes('created') ? 'form-message' : 'form-error'}>{provisionMessage}</p>}</form>}<div className="customer-toolbar"><label className="search-box"><Users size={15} /><input value={businessSearch} onChange={(event) => setBusinessSearch(event.target.value)} placeholder={t('searchBusinesses')} /></label><span className="heading-copy">{filteredBusinesses.length} / {businesses.length}</span></div>
            <div className="customer-table admin-business-table"><div className="table-row table-header admin-business-row"><span>{t('businessName')}</span><span>{t('slug')}</span><span>{t('programs')}</span><span>{t('customers')}</span><span>{t('action')}</span></div>{filteredBusinesses.map((business) => <div className="table-row admin-business-row" key={business.id}><strong data-label={t('businessName')}>{business.name}</strong><span data-label={t('slug')}>{business.slug}</span><span data-label={t('programs')}>{business.active_programs}</span><span data-label={t('customers')}>{business.customers}</span><button className="secondary-button" onClick={() => setSelectedBusiness(business)}>{t('view')}</button></div>)}</div>
            {!filteredBusinesses.length && <div className="panel-empty"><Store size={24} /><strong>{t('noBusinessesFound')}</strong><span>{t('noBusinessesFoundCopy')}</span></div>}
          </section>}
          {error && <p className="form-error">{t('loadError')}: {error}</p>}
          {selectedBusiness && <section className="panel info-panel selected-business-details" style={{ marginTop: '14px' }}><div className="panel-heading"><div><h2>{selectedBusiness.name}</h2><p>{selectedBusiness.slug}</p></div><button className="text-button" onClick={() => setSelectedBusiness(null)}>{t('closeDetails')}</button></div><div className="settings-list"><div><span>{t('created')}</span><strong>{formatDate(selectedBusiness.created_at)}</strong></div><div><span>{t('programs')}</span><strong>{selectedBusiness.active_programs}</strong></div><div><span>{t('customers')}</span><strong>{selectedBusiness.customers}</strong></div><div><span>{t('transactions')}</span><strong>{selectedBusiness.transactions}</strong></div><div><span>Subscription</span><strong>{subscriptionByBusiness[selectedBusiness.id]?.status || 'Not configured'}</strong></div><div><span>Expires</span><strong>{subscriptionByBusiness[selectedBusiness.id]?.ends_at ? formatDate(subscriptionByBusiness[selectedBusiness.id].ends_at) : '—'}</strong></div></div><form className="subscription-renewal-form" onSubmit={async (event) => { event.preventDefault(); setRenewalMessage(''); try { const result = await apiFetch('/api/admin/subscriptions/renew-cash', session.access_token, { method: 'POST', body: JSON.stringify({ businessId: selectedBusiness.id, planId: renewalForm.planId, amount: Number(renewalForm.amount), receivedAt: renewalForm.receivedAt || undefined, reference: renewalForm.reference, notes: renewalForm.notes, idempotencyKey: crypto.randomUUID() }) }); setSubscriptionByBusiness((current) => ({ ...current, [selectedBusiness.id]: result.subscription })); setRenewalMessage('Subscription renewed successfully.'); } catch (err) { setRenewalMessage(err.message) } }}><div className="renewal-heading"><div><h3>Renew subscription</h3><p>Record a cash payment and activate a new subscription period for this business.</p></div><span className="renewal-badge">Cash payment</span></div><div className="form-grid renewal-fields"><label><span>Subscription plan</span><small>Select the active plan to apply to this renewal.</small><select required value={renewalForm.planId} onChange={(event) => setRenewalForm({ ...renewalForm, planId: event.target.value })}><option value="">Select a plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.price} {plan.currency} / {plan.duration_days} days</option>)}</select></label><label><span>Amount received</span><small>The cash amount collected from the business.</small><div className="input-with-suffix"><input required min="0.01" step="0.01" type="number" value={renewalForm.amount} onChange={(event) => setRenewalForm({ ...renewalForm, amount: event.target.value })} placeholder="0.00" /><em>DZD</em></div></label><label><span>Payment date</span><small>Date the cash payment was received.</small><input required type="datetime-local" value={renewalForm.receivedAt} onChange={(event) => setRenewalForm({ ...renewalForm, receivedAt: event.target.value })} /></label><label><span>Payment reference <b>Optional</b></span><small>Receipt number or internal payment reference.</small><input value={renewalForm.reference} onChange={(event) => setRenewalForm({ ...renewalForm, reference: event.target.value })} placeholder="Receipt or reference number" /></label><label><span>Internal notes <b>Optional</b></span><small>Additional context for the admin audit trail.</small><input value={renewalForm.notes} onChange={(event) => setRenewalForm({ ...renewalForm, notes: event.target.value })} placeholder="e.g. Paid at office" /></label></div><div className="renewal-actions"><button className="primary-button" type="submit">Record cash renewal</button><span>Payment and subscription changes are recorded in the audit history.</span></div>{renewalMessage && <p className="form-message">{renewalMessage}</p>}</form></section>}

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
