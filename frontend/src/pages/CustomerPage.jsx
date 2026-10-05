import { useEffect, useRef, useState } from 'react'
import { Camera, Coffee, Gift, LogOut, QrCode, Sparkles, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { apiFetch } from '../lib/api'
import { getPublicProgram, joinProgram } from '../services/dashboardService'
import PreferencesControls from '../components/PreferencesControls'
import { usePreferences } from '../contexts/usePreferences'

export default function CustomerPage({ session, profile, onSignOut }) {
  const { t } = usePreferences()
  const [memberships, setMemberships] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinScannerOpen, setJoinScannerOpen] = useState(false)
  const [joinScannerError, setJoinScannerError] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const scannerRef = useRef(null)
  const [selectedMembership, setSelectedMembership] = useState(null)

  useEffect(() => () => { if (scannerRef.current) scannerRef.current.clear().catch(() => {}) }, [])

  useEffect(() => {
    let mounted = true
    apiFetch('/api/customer/memberships', session.access_token)
      .then((result) => {
        if (!mounted) return
        setMemberships(result.memberships || [])
        setTransactions(result.transactions || [])
      })
      .catch((requestError) => {
        if (mounted) setError(requestError.message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [session.access_token])

  useEffect(() => {
    if (!selectedMembership && !joinScannerOpen) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') { setSelectedMembership(null); setJoinScannerOpen(false) } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedMembership, joinScannerOpen])

  const stopJoinScanner = async () => {
    if (scannerRef.current) await scannerRef.current.clear().catch(() => {})
    scannerRef.current = null
    setJoinScannerOpen(false)
  }

  const startJoinScanner = async () => {
    setJoinScannerError('')
    setJoinBusy(true)
    setJoinScannerOpen(true)
    try {
      const { Html5QrcodeScanner } = await import('html5-qrcode')
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      const reader = document.getElementById('customer-join-qr-reader')
      if (!reader) throw new Error(t('scannerUnavailable'))
      const scanner = new Html5QrcodeScanner('customer-join-qr-reader', { fps: 10, qrbox: { width: 220, height: 220 } }, false)
      scanner.render(async (decodedText) => {
        try {
          const url = new URL(decodedText)
          const match = url.pathname.match(/^\/join\/([^/]+)/)
          if (!match) throw new Error(t('invalidBusinessQr'))
          await stopJoinScanner()
          const programResult = await getPublicProgram(match[1])
          const joinResult = await joinProgram(session.access_token, match[1])
          setMemberships((current) => [...current.filter((membership) => membership.id !== joinResult.membership?.id), { ...joinResult.membership, loyalty_programs: programResult.program }])
          setError('')
        } catch (scanError) { setJoinScannerError(scanError.message) }
      }, () => {})
      scannerRef.current = scanner
    } catch (scannerError) {
      setJoinScannerError(scannerError.message || t('cameraAccessFailed'))
    } finally { setJoinBusy(false) }
  }

  if (loading) return <div className="app-state"><strong>{t('loadingLoyaltyCards')}</strong></div>
  if (error) return <div className="app-state"><strong>{t('couldNotLoadCards')}</strong><p>{error}</p></div>

  return (
    <main className="customer-page">
      <header className="customer-header">
        <div className="brand-row"><div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div><span>loyaltea</span></div>
        <div className="customer-header-actions"><PreferencesControls compact /><span>{profile?.full_name || t('customer')}</span><button className="icon-button" onClick={onSignOut} aria-label={t('signOut')} title={t('signOut')}><LogOut size={18} /></button></div>
      </header>
      <section className="customer-hero">
        <div><p className="eyebrow">{t('loyaltyWallet')}</p><h1>{t('everyVisitCounts')}</h1><p className="heading-copy">{t('scanBusinessToJoin')}</p></div>
        <button className="primary-button" onClick={startJoinScanner} disabled={joinBusy}><Camera size={16} /> {t('scanBusinessQr')}</button>
      </section>
      {memberships.length === 0 ? (
        <section className="customer-empty"><Sparkles size={24} /><h2>{t('joinFirstProgram')}</h2><p>{t('askBusinessToScan')}</p><button className="primary-button" onClick={startJoinScanner} disabled={joinBusy}><Camera size={16} /> {t('scanBusinessQr')}</button></section>
      ) : (
        <section className="membership-grid">
          {memberships.map((membership) => {
            const program = membership.loyalty_programs
            const balance = program?.model === 'POINTS' ? membership.points_balance : membership.stamps_balance
            const unit = program?.model === 'POINTS' ? t('points') : t('stamps')
            const rewards = (program?.rewards || []).filter((reward) => reward.is_active && (!reward.expires_at || new Date(reward.expires_at) > new Date()))
            const nextThreshold = rewards.map((reward) => program.model === 'POINTS' ? reward.required_points : reward.required_stamps).filter((threshold) => threshold > balance).sort((left, right) => left - right)[0] || rewards.map((reward) => program.model === 'POINTS' ? reward.required_points : reward.required_stamps).sort((left, right) => left - right)[0] || 1
            const availableReward = rewards.find((reward) => balance >= (program.model === 'POINTS' ? reward.required_points : reward.required_stamps))
            return (
              <article className="membership-card" key={membership.id}>
                <div className="membership-card-top"><div><p className="eyebrow">{program?.businesses?.name || t('loyaltyProgram')}</p><h2>{program?.name}</h2></div><button className="membership-qr-button membership-qr-trigger" onClick={() => setSelectedMembership(membership)} aria-label={`${t('showQr')} ${program?.name}`}><QrCode size={24} /><span>{t('showQr')}</span></button></div>
                <button className="membership-qr-preview" onClick={() => setSelectedMembership(membership)} aria-label={`${t('showMembershipQr')} ${program?.name}`}><QRCodeSVG value={membership.secure_token} size={104} includeMargin bgColor="#ffffff" fgColor="#203b36" /><span>{t('scanAtCounter')}</span></button>
                <div className="membership-balance"><strong>{balance}</strong><span>{unit}</span></div>
                <div className="membership-progress"><span style={{ width: `${Math.min((balance / nextThreshold) * 100, 100)}%` }} /></div>
                <p className="membership-copy">{availableReward ? `${t('rewardUnlocked')}: ${availableReward.name}` : program?.description || t('keepGoing')}</p>
                <div className="membership-rewards">{rewards.slice(0, 3).map((reward) => <div className="reward-row" key={reward.id}><Gift size={16} /><span>{reward.name}</span><small>{program.model === 'POINTS' ? reward.required_points : reward.required_stamps} {unit}</small></div>)}</div>
                <small className="membership-token">{t('cardId')}: {membership.secure_token.slice(0, 8)}...</small>
              </article>
            )
          })}
        </section>
      )}
      {transactions.length > 0 && <section className="customer-history"><div className="panel-heading"><div><h2>{t('recentActivity')}</h2><p>{t('latestLoyaltyMovements')}</p></div></div>{transactions.slice(0, 8).map((transaction) => { const delta = transaction.stamps_delta || transaction.points_delta; return <div className="history-row" key={transaction.id}><span>{transaction.type === 'EARN' ? t('loyaltyEarned') : t('rewardRedeemed')}</span><strong className={delta > 0 ? 'history-positive' : 'history-negative'}>{delta > 0 ? '+' : ''}{delta}</strong><small>{new Date(transaction.created_at).toLocaleDateString()}</small></div> })}</section>}
      {joinScannerOpen && <div className="qr-modal-backdrop" role="presentation" onClick={stopJoinScanner}><section className="qr-modal customer-scanner-modal" role="dialog" aria-modal="true" aria-label={t('scanBusinessJoinQr')} onClick={(event) => event.stopPropagation()}><button className="icon-button qr-close" onClick={stopJoinScanner} aria-label={t('close')}><X size={18} /></button><p className="eyebrow">{t('joinBusinessProgram')}</p><h2>{t('scanBusinessQr')}</h2><div id="customer-join-qr-reader" className="customer-join-qr-reader" /><p className="heading-copy">{t('pointCameraAtBusinessQr')}</p>{joinScannerError && <p className="form-error">{joinScannerError}</p>}</section></div>}
      {selectedMembership && <div className="qr-modal-backdrop" role="presentation" onClick={() => setSelectedMembership(null)}><section className="qr-modal" role="dialog" aria-modal="true" aria-label={t('customerMembershipQr')} onClick={(event) => event.stopPropagation()}><button className="text-button qr-close" onClick={() => setSelectedMembership(null)}>{t('close')}</button><p className="eyebrow">{t('showAtCounter')}</p><h2>{selectedMembership.loyalty_programs?.businesses?.name}</h2><QRCodeSVG value={selectedMembership.secure_token} size={220} includeMargin /><p className="heading-copy">{t('secureMembershipIdentifier')}</p></section></div>}
    </main>
  )
}
