import { startTransition, useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, Sparkles } from 'lucide-react'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardSidebar from '../components/dashboard/DashboardSidebar'
import StatsGrid from '../components/dashboard/StatsGrid'
import PerformancePanel from '../components/dashboard/PerformancePanel'
import ActivityPanel from '../components/dashboard/ActivityPanel'
import CustomersPanel from '../components/dashboard/CustomersPanel'
import EmployeeOperationsPanel from '../components/dashboard/EmployeeOperationsPanel'
import RewardsPanel from '../components/dashboard/RewardsPanel'
import NotificationsPopover from '../components/dashboard/NotificationsPopover'
import OnboardingScreen from '../components/onboarding/OnboardingScreen'
import { earnLoyalty, loadBusinesses, loadDashboard, redeemReward } from '../services/dashboardService'
import { usePreferences } from '../contexts/usePreferences'

const emptyDashboard = { business: null, program: null, customers: [], transactions: [], redemptions: [], stats: { customers: 0, issued: 0, redeemed: 0, activeRate: 0 } }

export default function DashboardPage({ session, profile, onSignOut }) {
  const { t, language } = usePreferences()
  const [activePage, setActivePage] = useState('Overview')
  const [period, setPeriod] = useState('30')
  const [search, setSearch] = useState('')
  const [earnAmount, setEarnAmount] = useState('100')
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [businesses, setBusinesses] = useState([])
  const [selectedBusinessId, setSelectedBusinessId] = useState('')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [joinQrOpen, setJoinQrOpen] = useState(false)
  const [dataError, setDataError] = useState('')
  const [busyMembership, setBusyMembership] = useState('')
  const [loading, setLoading] = useState(true)

  const refreshDashboard = useCallback(async () => {
    const nextDashboard = await loadDashboard(session.access_token, period, selectedBusinessId)
    startTransition(() => setDashboard(nextDashboard))
    return nextDashboard
  }, [session.access_token, period, selectedBusinessId])

  useEffect(() => {
    loadBusinesses(session.access_token)
      .then((result) => {
        const nextBusinesses = result.data || []
        setBusinesses(nextBusinesses)
        if (!selectedBusinessId && nextBusinesses[0]?.id) setSelectedBusinessId(nextBusinesses[0].id)
      })
      .catch((error) => setDataError(error.message))
  }, [session.access_token, selectedBusinessId])

  useEffect(() => {
    refreshDashboard().catch((error) => setDataError(error.message)).finally(() => setLoading(false))
  }, [refreshDashboard])

  const activities = (dashboard.transactions || []).slice(0, 8).map((txn) => {
    const customer = dashboard.customers.find((c) => c.id === txn.membership_id)
    const value = txn.stamps_delta || txn.points_delta
    return {
      name: customer?.name || t('customer'),
      action: txn.type === 'EARN' ? `${t('earned')} ${value} ${dashboard.program?.model === 'POINTS' ? t('points') : t('stamps')}` : t('redeemedReward'),
      time: new Date(txn.created_at).toLocaleDateString(language),
      tone: txn.type === 'EARN' ? 'mint' : 'coral',
    }
  })

  const filteredCustomers = dashboard.customers
    .map((customer, index) => ({
      ...customer,
      initials: customer.initials || customer.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      color: customer.color || ['coral', 'mint', 'lavender'][index % 3],
      status: customer.status || (customer.stamps >= 10 ? t('rewardReady') : customer.stamps >= 7 ? t('almostThere') : t('onTrack')),
    }))
    .filter((customer) => `${customer.name} ${customer.email}`.toLowerCase().includes(search.toLowerCase()))

  const addLoyalty = async (customer) => {
    if (busyMembership) return
    const locationId = dashboard.business?.business_locations?.find((location) => location.is_active)?.id
    if (!locationId) return setDataError(t('createActiveLocation'))
    setBusyMembership(customer.id)
    setDataError('')
    try {
      await earnLoyalty(session.access_token, customer.id, locationId, dashboard.program?.model, dashboard.program?.model === 'POINTS' ? Number(earnAmount) : undefined, crypto.randomUUID())
      await refreshDashboard()
      showNotice(`${dashboard.program?.model === 'POINTS' ? t('point') : t('stamp')} ${t('addedTo')} ${customer.name}`)
    } catch (error) {
      setDataError(error.message)
    } finally {
      setBusyMembership('')
    }
  }

  const redeemCustomerReward = async (customer) => {
    if (busyMembership) return
    const reward = (dashboard.program?.rewards || []).find((item) => item.is_active && (dashboard.program.model === 'STAMPS' ? customer.stamps >= item.required_stamps : customer.stamps >= item.required_points))
    const locationId = dashboard.business?.business_locations?.find((location) => location.is_active)?.id
    if (!reward || !locationId) return setDataError(t('customerNotEligible'))
    setBusyMembership(customer.id)
    setDataError('')
    try {
      await redeemReward(session.access_token, customer.id, reward.id, locationId, crypto.randomUUID())
      await refreshDashboard()
      showNotice(`${reward.name} ${t('redeemedFor')} ${customer.name}`)
    } catch (error) {
      setDataError(error.message)
    } finally {
      setBusyMembership('')
    }
  }

  const showNotice = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  const publicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim() || ''
  const publicAppUrlIsValid = /^https:\/\/[^/]+(?:\/[^/]*)?$/i.test(publicAppUrl) && !/localhost|127\.0\.0\.1/i.test(publicAppUrl)
  const joinLink = publicAppUrlIsValid && dashboard.business?.slug && dashboard.program?.id ? `${publicAppUrl.replace(/\/$/, '')}/join/business/${encodeURIComponent(dashboard.business.slug)}` : ''
  const joinLinkError = !dashboard.business?.slug ? t('businessLinkUnavailable') : !dashboard.program?.id ? t('programLinkUnavailable') : !publicAppUrlIsValid ? t('publicAppUrlUnavailable') : ''

  const copyJoinLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser')
      await navigator.clipboard.writeText(joinLink)
      showNotice(t('joinLinkCopied'))
    } catch (error) {
      setDataError(error.message)
    }
  }

  const downloadJoinQr = () => {
    const svg = document.querySelector('.business-join-qr svg')
    if (!svg || !joinLink) return
    const source = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${dashboard.business.slug}-loyaltea-qr.svg`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="app-state"><strong>{t('loadingWorkspace')}</strong></div>
  if (dataError) return <div className="app-state"><strong>{t('couldNotLoadWorkspace')}</strong><p>{dataError}</p><button className="primary-button" onClick={() => { setDataError(''); setLoading(true); refreshDashboard().catch((error) => setDataError(error.message)).finally(() => setLoading(false)) }}>{t('tryAgain')}</button></div>
  if (!dashboard.business && profile?.role === 'BUSINESS_OWNER') return <OnboardingScreen accessToken={session.access_token} onComplete={refreshDashboard} />
  if (!dashboard.business) return <div className="app-state"><strong>{t('noWorkspace')}</strong><p>{t('noWorkspaceCopy')}</p><button className="text-button" onClick={onSignOut}>{t('signOut')}</button></div>

  return (
    <div className="app-shell">
      <DashboardSidebar 
        activePage={activePage} 
        isOpen={isMobileNavOpen} 
        profile={profile} 
        business={dashboard.business}
        businesses={businesses}
        selectedBusinessId={selectedBusinessId || dashboard.business?.id || ''}
        onBusinessChange={(businessId) => { setDataError(''); setLoading(true); setSelectedBusinessId(businessId) }}
          onSignOut={onSignOut}
        customerCount={dashboard.stats.customers}
        onClose={() => setIsMobileNavOpen(false)} 
        onNavigate={(page) => { setActivePage(page); setIsMobileNavOpen(false) }} 
      />
      <main className="main-content">
        <DashboardHeader 
          activePage={activePage} 
          profile={profile}
          notificationsOpen={notificationsOpen}
          onOpenMenu={() => setIsMobileNavOpen(true)} 
          onOpenNotifications={() => setNotificationsOpen((isOpen) => !isOpen)}
        />
        {notificationsOpen && <NotificationsPopover activities={activities} onClose={() => setNotificationsOpen(false)} />}
        <div className="page-content">
              <section className="page-heading">
            <div>
              <p className="eyebrow">{new Date().toLocaleDateString(language, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <h1>{t('goodMorning')}, {profile?.full_name || t('there')} <span className="wave">✦</span></h1>
              <p className="heading-copy">{t('dashboardSummary')}</p>
            </div>
            <div className="heading-actions"><button className="primary-button" onClick={() => setJoinQrOpen(true)} disabled={!joinLink}><QrCode size={16} /> {t('showJoinQr')}</button><button className="secondary-button" onClick={copyJoinLink} disabled={!joinLink}><Sparkles size={16} /> {t('copyLink')}</button></div>
          </section>
          <section className="panel business-join-card"><div className="panel-heading"><div><h2>{t('qrSectionTitle')}</h2><p>{t('qrSectionDescription')}</p></div><QrCode size={20} /></div><div className="business-join-content">{joinLink ? <div className="business-join-qr"><QRCodeSVG value={joinLink} size={156} includeMargin bgColor="#ffffff" fgColor="#203b36" /></div> : <div className="business-join-qr qr-unavailable"><QrCode size={42} /><span>{joinLinkError}</span></div>}<div className="business-join-copy"><strong>{dashboard.business.name}</strong><span>{dashboard.program?.name || t('programUnavailable')}</span><code>{joinLink || joinLinkError}</code><div className="qr-actions"><button className="secondary-button" onClick={copyJoinLink} disabled={!joinLink}>{t('copyCustomerJoinLink')}</button><button className="secondary-button" onClick={downloadJoinQr} disabled={!joinLink}>{t('downloadQr')}</button></div></div></div></section>
          {activePage === 'Rewards' ? <RewardsPanel program={dashboard.program} /> : <>
            {(activePage === 'Overview' || activePage === 'Customers') && <EmployeeOperationsPanel accessToken={session.access_token} program={dashboard.program} onAddLoyalty={addLoyalty} onRedeem={redeemCustomerReward} />}
            <StatsGrid values={dashboard.stats} />
            {(activePage === 'Overview' || activePage === 'Analytics') && <section className="content-grid"><PerformancePanel period={period} onPeriodChange={setPeriod} performance={dashboard.performance} />{activePage === 'Overview' && <ActivityPanel activities={activities} />}</section>}
            {(activePage === 'Overview' || activePage === 'Customers') && <CustomersPanel customers={filteredCustomers} program={dashboard.program} search={search} onSearchChange={setSearch} earnAmount={earnAmount} onEarnAmountChange={setEarnAmount} busyMembership={busyMembership} onAddLoyalty={addLoyalty} onRedeem={redeemCustomerReward} />}
          </>}
          <footer className="page-footer">
            <span><span className="status-indicator" /> API connected</span>
            <span>{profile?.full_name || 'Workspace member'} · {profile?.role || 'Member'}</span>
            <button className="text-button" onClick={onSignOut}>Sign out</button>
          </footer>
        </div>
      </main>
      {joinQrOpen && <div className="qr-modal-backdrop" role="presentation" onClick={() => setJoinQrOpen(false)}><section className="qr-modal business-join-modal" role="dialog" aria-modal="true" aria-label={t('businessQrModalLabel')} onClick={(event) => event.stopPropagation()}><button className="text-button qr-close" onClick={() => setJoinQrOpen(false)}>{t('close')}</button><p className="eyebrow">{t('customerJoinCode')}</p><h2>{dashboard.business.name}</h2>{joinLink ? <><code className="qr-destination">{joinLink}</code><QRCodeSVG value={joinLink} size={250} includeMargin bgColor="#ffffff" fgColor="#203b36" /><p className="heading-copy">{t('qrNativeCameraInstructions')}</p><div className="qr-actions"><button className="secondary-button" onClick={copyJoinLink}>{t('copyCustomerJoinLink')}</button><button className="secondary-button" onClick={downloadJoinQr}>{t('downloadQr')}</button></div></> : <p className="form-error">{joinLinkError}</p>}</section></div>}
      {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
    </div>
  )
}
