import { Coffee, BarChart3, Users, LogOut, Activity, Store, UserRound, ArrowUpRight, Menu, Mail, Phone, MessageSquare, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'
import ActivityLogSection from '../common/ActivityLogSection'

function formatWhatsappUrl(phone) {
  if (!phone) return null
  const cleaned = String(phone).replace(/\(0\)/g, '')
  let digits = cleaned.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) {
    digits = '213' + digits.slice(1)
  }
  return `https://wa.me/${digits}`
}

export default function PlatformAdminScreen({ session, profile, onSignOut }) {
  const { t, language } = usePreferences()
  const [businesses, setBusinesses] = useState([])
  const [archivedBusinesses, setArchivedBusinesses] = useState([])
  const [directoryTab, setDirectoryTab] = useState('active')
  const [actionFeedback, setActionFeedback] = useState(null)
  const [totals, setTotals] = useState({ businesses: 0, activePrograms: 0, customers: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('Dashboard')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [businessSearch, setBusinessSearch] = useState('')
  const [subscriptionByBusiness, setSubscriptionByBusiness] = useState({})
  const [renewalForm, setRenewalForm] = useState({ planId: '', amount: '', receivedAt: '', reference: '', notes: '' })
  const [renewalMessage, setRenewalMessage] = useState('')
  const [plans, setPlans] = useState([])
  const [showProvisionForm, setShowProvisionForm] = useState(false)
  const [provisionForm, setProvisionForm] = useState({ businessName: '', slug: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '', planId: '' })
  const [provisionMessage, setProvisionMessage] = useState('')
  const [planForm, setPlanForm] = useState({ name: '', description: '', price: '', durationDays: '30', currency: 'DZD' })
  const [planMessage, setPlanMessage] = useState('')

  const filteredBusinesses = useMemo(() => businesses.filter((business) => `${business.name} ${business.slug}`.toLowerCase().includes(businessSearch.toLowerCase())), [businesses, businessSearch])
  const filteredArchivedBusinesses = useMemo(() => archivedBusinesses.filter((business) => `${business.name} ${business.slug}`.toLowerCase().includes(businessSearch.toLowerCase())), [archivedBusinesses, businessSearch])
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
        setArchivedBusinesses(result.archivedBusinesses || [])
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

  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden'
      const onKeyDown = (event) => {
        if (event.key === 'Escape') setIsMobileNavOpen(false)
      }
      window.addEventListener('keydown', onKeyDown)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKeyDown)
      }
    }
    document.body.style.overflow = ''
    return undefined
  }, [isMobileNavOpen])

  if (loading) {
    return (
      <div className="app-state">
        <strong>{t('loadingAdminDashboard')}</strong>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isMobileNavOpen ? 'is-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div>
          <span>loyaltea</span>
          <button className="icon-button close-nav" onClick={() => setIsMobileNavOpen(false)} aria-label={t('closeNavigation')}>
            <X size={18} />
          </button>
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
          <button className={`nav-item ${activeView === 'Dashboard' ? 'active' : ''}`} onClick={() => { setActiveView('Dashboard'); setIsMobileNavOpen(false) }}>
            <BarChart3 size={18} />{t('dashboard')}
          </button>
          <button className={`nav-item ${activeView === 'Businesses' ? 'active' : ''}`} onClick={() => { setActiveView('Businesses'); setIsMobileNavOpen(false) }}>
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

      {isMobileNavOpen && (
        <div
          className="sidebar-backdrop"
          role="presentation"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setIsMobileNavOpen(true)} aria-label={t('openNavigation')}>
            <Menu size={20} />
          </button>
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
          <div style={{ marginTop: '20px' }}>
            <ActivityLogSection accessToken={session.access_token} initialLimit={2} loadBatchSize={20} title={t('platformActivity', 'Platform Activity Log')} subtitle={t('allPlatformTransactions', 'Latest loyalty transactions across all businesses')} />
          </div>
          </>}
          {activeView === 'Businesses' && <section className="panel customers-panel">
            <div className="panel-heading">
              <div>
                <h2>{t('managedBusinesses')}</h2>
                <p>{t('managedBusinessesCopy')}</p>
              </div>
              <button className="primary-button" onClick={() => { setShowProvisionForm((visible) => !visible); setProvisionMessage('') }}>
                <Store size={15} />{showProvisionForm ? t('closeForm') : t('createBusiness')}
              </button>
            </div>

            {actionFeedback && (
              <div className={`form-message ${actionFeedback.type === 'error' ? 'form-error' : 'form-message-success'}`} style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{actionFeedback.message}</span>
                <button type="button" className="text-button" style={{ marginLeft: '12px', cursor: 'pointer' }} onClick={() => setActionFeedback(null)}>✕</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`secondary-button ${directoryTab === 'active' ? 'primary-button' : ''}`}
                onClick={() => { setDirectoryTab('active'); setActionFeedback(null) }}
              >
                {t('activeBusinesses')} ({businesses.length})
              </button>
              <button
                type="button"
                className={`secondary-button ${directoryTab === 'archived' ? 'primary-button' : ''}`}
                onClick={() => { setDirectoryTab('archived'); setActionFeedback(null) }}
              >
                {t('archivedBusinesses')} ({archivedBusinesses.length})
              </button>
            </div>

            {showProvisionForm && <form className="provision-form" onSubmit={async (event) => { event.preventDefault(); setProvisionMessage(''); try { const result = await apiFetch('/api/admin/businesses/provision', session.access_token, { method: 'POST', body: JSON.stringify(provisionForm) }); setBusinesses((current) => [{ ...result.business, active_programs: 0, customers: 0, transactions: 0, redemptions: 0 }, ...current]); setSubscriptionByBusiness((current) => ({ ...current, [result.business.id]: result.subscription })); setProvisionForm({ businessName: '', slug: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '', planId: '' }); setProvisionMessage(t('pendingUntilPaid')); } catch (err) { setProvisionMessage(err.message) } }}><div className="provision-form-heading"><div><h3>{t('createBusinessAccount')}</h3><p>{t('createsPendingBusiness')}</p></div><span className="renewal-badge">{t('pendingUntilPaid')}</span></div><div className="provision-fields"><label>{t('businessNameLabel')}<input required value={provisionForm.businessName} onChange={(event) => setProvisionForm({ ...provisionForm, businessName: event.target.value })} /></label><label>{t('businessSlugLabel')}<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={provisionForm.slug} onChange={(event) => setProvisionForm({ ...provisionForm, slug: event.target.value.toLowerCase() })} /></label><label>{t('ownerFullNameLabel')}<input required value={provisionForm.ownerFullName} onChange={(event) => setProvisionForm({ ...provisionForm, ownerFullName: event.target.value })} /></label><label>{t('ownerEmailLabel')}<input type="email" value={provisionForm.ownerEmail} onChange={(event) => setProvisionForm({ ...provisionForm, ownerEmail: event.target.value })} /></label><label>{t('ownerPhoneLabel')}<input type="tel" placeholder="+213..." value={provisionForm.ownerPhone} onChange={(event) => setProvisionForm({ ...provisionForm, ownerPhone: event.target.value })} /></label><label>{t('temporaryPassword')}<input required minLength="8" type="password" value={provisionForm.ownerPassword} onChange={(event) => setProvisionForm({ ...provisionForm, ownerPassword: event.target.value })} /></label><label className="plan-field">{t('subscriptionPlanLabel')}<select required value={provisionForm.planId} onChange={(event) => setProvisionForm({ ...provisionForm, planId: event.target.value })}><option value="">{t('selectPlan')}</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.price} {plan.currency} / {plan.duration_days} {t('days')}</option>)}</select></label></div><button className="primary-button" type="submit">{t('createPendingBusiness')}</button>{provisionMessage && <p className={provisionMessage.includes('created') ? 'form-message' : 'form-error'}>{provisionMessage}</p>}</form>}

            <div className="customer-toolbar"><label className="search-box"><Users size={15} /><input value={businessSearch} onChange={(event) => setBusinessSearch(event.target.value)} placeholder={t('searchBusinesses')} /></label><span className="heading-copy">{directoryTab === 'active' ? `${filteredBusinesses.length} / ${businesses.length}` : `${filteredArchivedBusinesses.length} / ${archivedBusinesses.length}`}</span></div>

            {directoryTab === 'active' ? (
              <>
                <div className="customer-table admin-business-table">
                  <div className="table-row table-header admin-business-row">
                    <span>{t('businessName')}</span>
                    <span>{t('slug')}</span>
                    <span>{t('programs')}</span>
                    <span>{t('customers')}</span>
                    <span>{t('status')}</span>
                    <span>{t('action')}</span>
                  </div>
                  {filteredBusinesses.map((business) => (
                    <div className="table-row admin-business-row" key={business.id}>
                      <strong data-label={t('businessName')}>{business.name}</strong>
                      <span data-label={t('slug')}>{business.slug}</span>
                      <span data-label={t('programs')}>{business.active_programs}</span>
                      <span data-label={t('customers')}>{business.customers}</span>
                      <span data-label={t('status')} className={`status-pill business-status-${business.status || 'active'}`}>
                        {t(`status${(business.status || 'active').charAt(0).toUpperCase()}${(business.status || 'active').slice(1)}`)}
                      </span>
                      <div className="business-actions">
                        <button className="secondary-button" onClick={() => setSelectedBusiness(business)}>{t('view')}</button>
                        <button className="secondary-button" onClick={async () => {
                          if (!window.confirm(`${business.status === 'paused' ? t('resume') : t('pause')} ${business.name}?`)) return;
                          try {
                            const result = await apiFetch(`/api/admin/businesses/${business.id}/${business.status === 'paused' ? 'resume' : 'pause'}`, session.access_token, { method: 'POST' });
                            setBusinesses((current) => current.map((item) => item.id === business.id ? { ...item, status: result.business.status } : item));
                            setActionFeedback({ type: 'success', message: `Business "${business.name}" status updated to ${result.business.status}.` });
                          } catch (err) {
                            setError(err.message);
                            setActionFeedback({ type: 'error', message: err.message });
                          }
                        }}>
                          {business.status === 'paused' ? t('resume') : t('pause')}
                        </button>
                        <button className="secondary-button danger-button" onClick={async () => {
                          if (!window.confirm(t('archiveBusinessConfirm'))) return;
                          try {
                            const result = await apiFetch(`/api/admin/businesses/${business.id}`, session.access_token, { method: 'DELETE' });
                            setBusinesses((current) => current.filter((item) => item.id !== business.id));
                            if (result.action === 'archived') {
                              setArchivedBusinesses((current) => [{ ...business, archived_at: new Date().toISOString(), status: 'suspended' }, ...current]);
                            }
                            if (selectedBusiness?.id === business.id) {
                              setSelectedBusiness(null);
                            }
                            setActionFeedback({ type: 'success', message: result.message || 'Business processed successfully.' });
                            setError('');
                          } catch (err) {
                            setError(err.message);
                            setActionFeedback({ type: 'error', message: err.message });
                          }
                        }}>
                          {t('deleteBusiness')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!filteredBusinesses.length && <div className="panel-empty"><Store size={24} /><strong>{t('noBusinessesFound')}</strong><span>{t('noBusinessesFoundCopy')}</span></div>}
              </>
            ) : (
              <>
                <div className="customer-table admin-business-table">
                  <div className="table-row table-header admin-business-row">
                    <span>{t('businessName')}</span>
                    <span>{t('slug')}</span>
                    <span>{t('archivedAt')}</span>
                    <span>{t('customers')}</span>
                    <span>{t('status')}</span>
                    <span>{t('action')}</span>
                  </div>
                  {filteredArchivedBusinesses.map((business) => (
                    <div className="table-row admin-business-row" key={business.id}>
                      <strong data-label={t('businessName')}>{business.name}</strong>
                      <span data-label={t('slug')}>{business.slug}</span>
                      <span data-label={t('archivedAt')}>{business.archived_at ? formatDate(business.archived_at) : '—'}</span>
                      <span data-label={t('customers')}>{business.customers || 0}</span>
                      <span data-label={t('status')} className="status-pill business-status-suspended">
                        {t('archived')}
                      </span>
                      <div className="business-actions">
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{t('auditPreserved')}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {!filteredArchivedBusinesses.length && <div className="panel-empty"><Store size={24} /><strong>{t('noArchivedBusinesses')}</strong><span>{t('noArchivedBusinessesCopy')}</span></div>}
              </>
            )}
          </section>}
          {activeView === 'Dashboard' && <section className="panel info-panel plan-management-panel"><div className="panel-heading"><div><h2>{t('subscriptionPlans')}</h2><p>{t('managePlansCopy')}</p></div></div><form className="plan-form" onSubmit={async (event) => { event.preventDefault(); setPlanMessage(''); try { const result = await apiFetch('/api/admin/subscription-plans', session.access_token, { method: 'POST', body: JSON.stringify({ ...planForm, price: Number(planForm.price), durationDays: Number(planForm.durationDays) }) }); setPlans((current) => [...current, result.plan]); setPlanForm({ name: '', description: '', price: '', durationDays: '30', currency: 'DZD' }); setPlanMessage(t('planCreated')); } catch (err) { setPlanMessage(err.message) } }}><input required placeholder={t('planNamePlaceholder')} value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} /><input placeholder={t('descriptionPlaceholder')} value={planForm.description} onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })} /><input required min="0" step="0.01" type="number" placeholder={t('pricePlaceholder')} value={planForm.price} onChange={(event) => setPlanForm({ ...planForm, price: event.target.value })} /><input required min="1" step="1" type="number" placeholder={t('durationDaysPlaceholder')} value={planForm.durationDays} onChange={(event) => setPlanForm({ ...planForm, durationDays: event.target.value })} /><button className="primary-button" type="submit">{t('createPlan')}</button></form>{planMessage && <p className="form-message">{planMessage}</p>}<div className="plan-list">{plans.map((plan) => <div className="plan-row" key={plan.id}><div><strong>{plan.name}</strong><small>{plan.price} {plan.currency} · {plan.duration_days} {t('days')}</small></div><button className="secondary-button" onClick={async () => { try { const result = await apiFetch(`/api/admin/subscription-plans/${plan.id}`, session.access_token, { method: 'PATCH', body: JSON.stringify({ name: plan.name, description: plan.description, price: plan.price, currency: plan.currency, durationDays: plan.duration_days, features: plan.features, isActive: !plan.is_active }) }); setPlans((current) => current.map((item) => item.id === plan.id ? result.plan : item)); } catch (err) { setPlanMessage(err.message) } }}>{plan.is_active ? t('deactivate') : t('activate')}</button></div>)}</div></section>}
          {error && <p className="form-error">{t('loadError')}: {error}</p>}
          {selectedBusiness && (
            <section className="panel info-panel selected-business-details">
              <div className="panel-heading selected-business-heading">
                <div className="selected-business-title">
                  <h2>{selectedBusiness.name}</h2>
                  <p className="selected-business-slug">{selectedBusiness.slug}</p>
                </div>
                <button
                  type="button"
                  className="secondary-button close-details-button"
                  onClick={() => setSelectedBusiness(null)}
                  aria-label={t('closeDetails')}
                >
                  <X size={15} />
                  <span>{t('closeDetails')}</span>
                </button>
              </div>

              <div className="admin-business-details-grid">
                <div className="admin-business-meta-card">
                  <div className="settings-list admin-details-list">
                    <div>
                      <span>{t('businessId')}</span>
                      <strong className="copyable-id" title={selectedBusiness.id}>{selectedBusiness.id}</strong>
                    </div>
                    <div>
                      <span>{t('accountStatus')}</span>
                      <strong className={`status-pill business-status-${selectedBusiness.status || 'active'}`}>
                        {t(`status${(selectedBusiness.status || 'active').charAt(0).toUpperCase()}${(selectedBusiness.status || 'active').slice(1)}`)}
                      </strong>
                    </div>
                    <div>
                      <span>{t('subscriptionLabel')}</span>
                      <strong className="detail-value">{subscriptionByBusiness[selectedBusiness.id]?.status || t('notConfigured')}</strong>
                    </div>
                    <div>
                      <span>{t('expires')}</span>
                      <strong className="detail-value">{subscriptionByBusiness[selectedBusiness.id]?.ends_at ? formatDate(subscriptionByBusiness[selectedBusiness.id].ends_at) : '—'}</strong>
                    </div>
                    <div>
                      <span>{t('created')}</span>
                      <strong className="detail-value">{formatDate(selectedBusiness.created_at)}</strong>
                    </div>
                    <div>
                      <span>{t('programs')}</span>
                      <strong className="detail-value">{selectedBusiness.active_programs}</strong>
                    </div>
                    <div>
                      <span>{t('customers')}</span>
                      <strong className="detail-value">{selectedBusiness.customers}</strong>
                    </div>
                    <div>
                      <span>{t('transactions')}</span>
                      <strong className="detail-value">{selectedBusiness.transactions}</strong>
                    </div>
                  </div>
                </div>

                <div className="admin-contact-card">
                  <div className="contact-card-header">
                    <h3>{t('ownerContactDetails')}</h3>
                  </div>
                  <div className="settings-list admin-details-list">
                    <div>
                      <span>{t('ownerName')}</span>
                      <strong className="detail-value">{selectedBusiness.owner_name || '—'}</strong>
                    </div>
                    <div>
                      <span>{t('address')}</span>
                      <strong className="detail-value">{selectedBusiness.address || '—'}</strong>
                    </div>
                    <div>
                      <span>{t('email')}</span>
                      {selectedBusiness.owner_email ? (
                        <a href={`mailto:${selectedBusiness.owner_email}`} className="contact-link">
                          <Mail size={13} />
                          <span className="contact-text">{selectedBusiness.owner_email}</span>
                        </a>
                      ) : (
                        <span className="detail-value">—</span>
                      )}
                    </div>
                    <div>
                      <span>{t('phone')}</span>
                      {selectedBusiness.owner_phone ? (
                        <a href={`tel:${selectedBusiness.owner_phone}`} className="contact-link">
                          <Phone size={13} />
                          <span className="contact-text">{selectedBusiness.owner_phone}</span>
                        </a>
                      ) : (
                        <span className="detail-value">—</span>
                      )}
                    </div>
                  </div>
                  <div className="contact-actions-bar">
                    {selectedBusiness.owner_email && (
                      <a href={`mailto:${selectedBusiness.owner_email}`} className="secondary-button contact-action-btn">
                        <Mail size={14} /> <span>{t('sendEmail')}</span>
                      </a>
                    )}
                    {selectedBusiness.owner_phone && (
                      <a href={`tel:${selectedBusiness.owner_phone}`} className="secondary-button contact-action-btn">
                        <Phone size={14} /> <span>{t('call')}</span>
                      </a>
                    )}
                    {formatWhatsappUrl(selectedBusiness.owner_phone) && (
                      <a
                        href={formatWhatsappUrl(selectedBusiness.owner_phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="secondary-button whatsapp-button contact-action-btn"
                      >
                        <MessageSquare size={14} /> <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ margin: '20px 0' }}>
                <ActivityLogSection accessToken={session.access_token} businessId={selectedBusiness.id} initialLimit={2} loadBatchSize={20} title={`${selectedBusiness.name} · ${t('activityLog', 'Activity Log')}`} />
              </div>

              <form className="subscription-renewal-form" onSubmit={async (event) => { event.preventDefault(); setRenewalMessage(''); try { const result = await apiFetch('/api/admin/subscriptions/renew-cash', session.access_token, { method: 'POST', body: JSON.stringify({ businessId: selectedBusiness.id, planId: renewalForm.planId, amount: Number(renewalForm.amount), receivedAt: renewalForm.receivedAt || undefined, reference: renewalForm.reference, notes: renewalForm.notes, idempotencyKey: crypto.randomUUID() }) }); setSubscriptionByBusiness((current) => ({ ...current, [selectedBusiness.id]: result.subscription })); setRenewalMessage(t('subscriptionRenewed')); } catch (err) { setRenewalMessage(err.message) } }}>
                <div className="renewal-heading">
                  <div>
                    <h3>{t('renewSubscription')}</h3>
                    <p>{t('renewSubscriptionCopy')}</p>
                  </div>
                  <span className="renewal-badge">{t('cashPayment')}</span>
                </div>
                <div className="form-grid renewal-fields">
                  <label>
                    <span>{t('subscriptionPlanLabel')}</span>
                    <small>{t('selectPlanRenewalHelp')}</small>
                    <select required value={renewalForm.planId} onChange={(event) => setRenewalForm({ ...renewalForm, planId: event.target.value })}>
                      <option value="">{t('selectPlan')}</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} · {plan.price} {plan.currency} / {plan.duration_days} {t('days')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t('amountReceived')}</span>
                    <small>{t('amountReceivedHelp')}</small>
                    <div className="input-with-suffix">
                      <input required min="0.01" step="0.01" type="number" value={renewalForm.amount} onChange={(event) => setRenewalForm({ ...renewalForm, amount: event.target.value })} placeholder="0.00" />
                      <em>DZD</em>
                    </div>
                  </label>
                  <label>
                    <span>{t('paymentDate')}</span>
                    <small>{t('paymentDateHelp')}</small>
                    <input required type="datetime-local" value={renewalForm.receivedAt} onChange={(event) => setRenewalForm({ ...renewalForm, receivedAt: event.target.value })} />
                  </label>
                  <label>
                    <span>{t('paymentReference')} <b>{t('optional')}</b></span>
                    <small>{t('paymentReferenceHelp')}</small>
                    <input value={renewalForm.reference} onChange={(event) => setRenewalForm({ ...renewalForm, reference: event.target.value })} placeholder="Receipt or reference number" />
                  </label>
                  <label>
                    <span>{t('internalNotes')} <b>{t('optional')}</b></span>
                    <small>{t('internalNotesHelp')}</small>
                    <input value={renewalForm.notes} onChange={(event) => setRenewalForm({ ...renewalForm, notes: event.target.value })} placeholder="e.g. Paid at office" />
                  </label>
                </div>
                <div className="renewal-actions">
                  <button className="primary-button" type="submit">{t('recordCashRenewal')}</button>
                  <span>{t('auditHistoryNotice')}</span>
                </div>
                {renewalMessage && <p className="form-message">{renewalMessage}</p>}
              </form>
            </section>
          )}

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
