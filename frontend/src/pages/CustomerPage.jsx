import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  Copy,
  Gift,
  KeyRound,
  LogOut,
  QrCode,
  Sparkles,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { apiFetch } from '../lib/api'
import PreferencesControls from '../components/PreferencesControls'
import { usePreferences } from '../contexts/usePreferences'
import ActivityLogSection from '../components/common/ActivityLogSection'

const BRAND_PALETTES = [
  { gradient: 'linear-gradient(135deg, #1d3832 0%, #295147 100%)', badge: '#438a72', border: '#295147' },
  { gradient: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', badge: '#3b82f6', border: '#2563eb' },
  { gradient: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%)', badge: '#8b5cf6', border: '#6d28d9' },
  { gradient: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)', badge: '#ea580c', border: '#c2410c' },
  { gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', badge: '#14b8a6', border: '#0d9488' },
  { gradient: 'linear-gradient(135deg, #831843 0%, #db2777 100%)', badge: '#ec4899', border: '#db2777' },
  { gradient: 'linear-gradient(135deg, #374151 0%, #4b5563 100%)', badge: '#6b7280', border: '#4b5563' },
  { gradient: 'linear-gradient(135deg, #3f2c20 0%, #78350f 100%)', badge: '#d97706', border: '#78350f' },
]

function getBusinessTheme(str) {
  let hash = 0
  const text = String(str || 'loyaltea')
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
  }
  const idx = Math.abs(hash) % BRAND_PALETTES.length
  return BRAND_PALETTES[idx]
}

export default function CustomerPage({ session, profile, onSignOut }) {
  const { t } = usePreferences()
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinScannerOpen, setJoinScannerOpen] = useState(false)
  const [selectedMembership, setSelectedMembership] = useState(null)
  const [tokenModalMembership, setTokenModalMembership] = useState(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const scannerRef = useRef(null)

  const fetchCustomerData = useCallback(async () => {
    setError('')
    try {
      const result = await apiFetch('/api/customer/memberships', session.access_token)
      setMemberships(result.memberships || [])
    } catch (requestError) {
      setError(requestError.message || t('couldNotLoadCards', 'Could not load your loyalty cards'))
    } finally {
      setLoading(false)
    }
  }, [session.access_token, t])

  useEffect(() => {
    let mounted = true
    const fetchCards = (isInitial = false) => {
      if (isInitial) setLoading(true)
      apiFetch('/api/customer/memberships', session.access_token)
        .then((result) => {
          if (!mounted) return
          setMemberships(result.memberships || [])
        })
        .catch((requestError) => {
          if (mounted && isInitial) setError(requestError.message || t('couldNotLoadCards', 'Could not load your loyalty cards'))
        })
        .finally(() => {
          if (mounted && isInitial) setLoading(false)
        })
    }

    fetchCards(true)

    // Active 4-second polling to reflect counter scans and awards in real time
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchCards(false)
      }
    }, 4000)

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchCards(false)
      }
    }

    window.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      mounted = false
      clearInterval(interval)
      window.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [session.access_token, t])

  const handleRetry = () => {
    setLoading(true)
    fetchCustomerData()
  }

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop()
        }
        scannerRef.current.clear()
      } catch {
        // ignore cleanup errors
      }
    }
    scannerRef.current = null
    setScannerActive(false)
  }, [])

  const handleDecodedJoinCode = useCallback(
    (decodedText) => {
      const raw = (decodedText || '').trim()
      if (!raw) return
      stopScanner()
      setJoinScannerOpen(false)

      try {
        const url = new URL(raw, window.location.origin)
        if (url.pathname.startsWith('/join/')) {
          window.location.assign(url.href)
          return
        }
      } catch {
        // not a standard URL
      }

      if (raw.startsWith('/join/')) {
        window.location.assign(raw)
        return
      }

      if (/^https?:\/\//i.test(raw)) {
        window.location.assign(raw)
        return
      }

      window.location.assign(`/join/business/${encodeURIComponent(raw)}`)
    },
    [stopScanner]
  )

  const startScanner = useCallback(async () => {
    setScannerError('')
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      !/localhost|127\.0\.0\.1/i.test(window.location.hostname)
    ) {
      setScannerError(t('cameraInsecureOrigin', 'Camera requires HTTPS or localhost'))
      return
    }
    try {
      await stopScanner()
      const { Html5Qrcode } = await import('html5-qrcode')
      const element = document.getElementById('customer-join-qr-reader')
      if (!element) return

      const scanner = new Html5Qrcode('customer-join-qr-reader')
      scannerRef.current = scanner
      setScannerActive(true)

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleDecodedJoinCode(decodedText)
        },
        () => {
          // ignore frame errors
        }
      )
    } catch (err) {
      const name = err?.name || ''
      const msg = err?.message || String(err || '')
      if (name === 'NotAllowedError' || /permission|denied|allowed/i.test(msg)) {
        setScannerError(t('cameraAccessFailed', 'Camera access was denied'))
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || /not found|device/i.test(msg)) {
        setScannerError(t('cameraNotFound', 'No camera detected'))
      } else if (name === 'NotSupportedError' || /not supported/i.test(msg)) {
        setScannerError(t('cameraScannerUnsupported', 'Scanner not supported on this browser'))
      } else {
        setScannerError(msg || t('couldNotStartScanner', 'Could not start camera scanner'))
      }
      setScannerActive(false)
    }
  }, [stopScanner, handleDecodedJoinCode, t])

  const closeScanner = useCallback(() => {
    stopScanner()
    setJoinScannerOpen(false)
    setScannerError('')
  }, [stopScanner])

  const copyToken = async (token) => {
    if (!token) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(token)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = token
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2500)
    } catch {
      // Ignore clipboard error
    }
  }

  useEffect(() => {
    if (!joinScannerOpen) return undefined
    const timer = window.setTimeout(() => {
      startScanner()
    }, 50)
    return () => {
      window.clearTimeout(timer)
      stopScanner()
    }
  }, [joinScannerOpen, startScanner, stopScanner])

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) scannerRef.current.stop().catch(() => {})
          scannerRef.current.clear()
        } catch {
          // cleanup
        }
        scannerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedMembership && !joinScannerOpen && !tokenModalMembership) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setSelectedMembership(null)
        setTokenModalMembership(null)
        closeScanner()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedMembership, joinScannerOpen, tokenModalMembership, closeScanner])

  if (loading) {
    return (
      <div className="app-state">
        <div className="brand-mark loading-pulse">
          <Coffee size={24} strokeWidth={2.5} />
        </div>
        <strong>{t('loadingLoyaltyCards', 'Loading your loyalty cards...')}</strong>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-state">
        <strong>{t('couldNotLoadCards', 'Could not load your loyalty cards')}</strong>
        <p>{error}</p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <button className="primary-button" onClick={handleRetry}>
            {t('tryAgain', 'Try again')}
          </button>
          <button className="text-button" onClick={onSignOut}>
            {t('signOut', 'Sign out')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <main className="customer-page">
      <header className="customer-header">
        <div className="brand-row">
          <div className="brand-mark">
            <Coffee size={18} strokeWidth={2.5} />
          </div>
          <span>loyaltea</span>
        </div>
        <div className="customer-header-actions">
          <PreferencesControls compact />
          <span className="customer-profile-name">{profile?.full_name || t('customer', 'Customer')}</span>
          <button className="icon-button" onClick={onSignOut} aria-label={t('signOut', 'Sign out')} title={t('signOut', 'Sign out')}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="customer-hero">
        <div>
          <p className="eyebrow">{t('loyaltyWallet', 'Loyalty Wallet')}</p>
          <h1>{t('everyVisitCounts', 'Every visit brings you closer to your reward')}</h1>
          <p className="heading-copy">{t('scanBusinessToJoin', 'Scan a business QR code to join their loyalty program')}</p>
        </div>
        <button className="primary-button" onClick={() => setJoinScannerOpen(true)}>
          <Camera size={16} /> {t('scanBusinessQr', 'Scan Business QR')}
        </button>
      </section>

      {memberships.length === 0 ? (
        <section className="customer-empty">
          <Sparkles size={28} />
          <h2>{t('joinFirstProgram', 'No Loyalty Cards Yet')}</h2>
          <p>{t('askBusinessToScan', 'Scan a QR code at your favorite local business to get your first digital stamp or points card.')}</p>
          <button className="primary-button" style={{ marginTop: '12px' }} onClick={() => setJoinScannerOpen(true)}>
            <Camera size={16} /> {t('scanBusinessQr', 'Scan Business QR')}
          </button>
        </section>
      ) : (
        <section className="membership-grid">
          {memberships.map((membership) => {
            const program = membership.loyalty_programs || {}
            const businessName = program.businesses?.name || program.name || t('loyaltyProgram', 'Loyalty Program')
            const isPoints = program.model === 'POINTS'
            const balance = isPoints ? membership.points_balance || 0 : membership.stamps_balance || 0
            const unit = isPoints ? t('points', 'points') : t('stamps', 'stamps')

            const theme = getBusinessTheme(businessName)

            // Find the active offer
            const allRewards = (program.rewards || []).filter((r) => !r.deleted_at)
            const activeOffer = allRewards.find((r) => r.is_active)
            const isOfferExpired = activeOffer?.expires_at && new Date(activeOffer.expires_at) <= new Date()

            const targetThreshold = activeOffer
              ? (isPoints ? activeOffer.required_points : activeOffer.required_stamps) || 1
              : 10

            const progressPercent = Math.min(100, Math.max(0, Math.round((balance / targetThreshold) * 100)))
            const isUnlocked = activeOffer && balance >= targetThreshold && !isOfferExpired

            return (
              <article className="membership-card customer-card-enhanced" key={membership.id}>
                {/* Visual Business Brand Header Ribbon */}
                <div className="card-brand-stripe" style={{ background: theme.gradient }} />

                <div className="membership-card-inner">
                  {/* Header: Prominent Business Name & Loyalty Model Badge */}
                  <div className="membership-card-header">
                    <div className="membership-brand-info">
                      <div className="membership-brand-title-wrap">
                        {program.businesses?.logo_url && (
                          <img
                            src={program.businesses.logo_url}
                            alt=""
                            className="membership-business-logo"
                            loading="lazy"
                          />
                        )}
                        <h2 className="membership-business-title">{businessName}</h2>
                      </div>
                      <p className="membership-program-subtitle">{program.name || t('loyaltyProgram', 'Loyalty Program')}</p>
                    </div>
                    <div className="membership-meta-badges">
                      <span className="membership-model-badge" style={{ borderColor: theme.badge, color: theme.badge }}>
                        {isPoints ? t('pointsModel', 'Points') : t('stampsModel', 'Stamps')}
                      </span>
                    </div>
                  </div>

                  {/* Hero Balance & Touch QR Target */}
                  <div className="membership-hero-row">
                    <div className="membership-balance-section">
                      <div className="membership-balance">
                        <strong>{balance}</strong>
                        <span>{unit}</span>
                      </div>
                      <div className="membership-milestone-hint">
                        {isUnlocked ? (
                          <span className="unlocked-hint">
                            <Sparkles size={14} className="milestone-sparkle" />
                            <strong>{t('rewardReadyToRedeem', 'Reward ready to redeem!')}</strong>
                          </span>
                        ) : activeOffer ? (
                          <span>
                            {Math.max(0, targetThreshold - balance)} {unit} {t('until', 'until')} {activeOffer.name}
                          </span>
                        ) : (
                          <span>{t('keepGoing', 'Keep visiting to earn rewards')}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="membership-qr-touch-target"
                      onClick={() => setSelectedMembership(membership)}
                      aria-label={`${t('tapToEnlargeQr', 'Tap to enlarge QR')} - ${businessName}`}
                      title={t('tapToEnlargeQr', 'Tap to enlarge QR')}
                    >
                      <div className="membership-qr-plate">
                        <QRCodeSVG
                          value={membership.secure_token}
                          size={76}
                          level="M"
                          includeMargin={false}
                          bgColor="#ffffff"
                          fgColor="#1d3832"
                        />
                      </div>
                      <span className="qr-touch-label">{t('tapToEnlarge', 'Enlarge')}</span>
                    </button>
                  </div>

                  {/* Mathematical Progress Bar */}
                  <div className="membership-progress-section">
                    <div className="progress-labels">
                      <span className="progress-current">
                        {balance} / {targetThreshold} {unit}
                      </span>
                      <span className="progress-percentage">{progressPercent}%</span>
                    </div>
                    <div
                      className="membership-progress"
                      role="progressbar"
                      aria-valuenow={progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span style={{ width: `${progressPercent}%`, background: theme.badge }} />
                    </div>
                  </div>

                  {/* Active Offer Details Card */}
                  {activeOffer ? (
                    <div className={`customer-offer-card ${isUnlocked ? 'is-unlocked' : ''}`}>
                      <div className="offer-card-top">
                        <div className="offer-card-icon">
                          {isUnlocked ? <CheckCircle2 size={18} /> : <Gift size={18} />}
                        </div>
                        <div className="offer-card-text">
                          <strong className="offer-card-name">{activeOffer.name}</strong>
                          <p className="offer-card-desc">
                            {activeOffer.description || t('noDescription', 'Reward upon reaching required progress')}
                          </p>
                        </div>
                      </div>
                      <div className="offer-card-footer">
                        <span className="offer-req-badge">
                          {targetThreshold} {unit} {t('required', 'required')}
                        </span>
                        {activeOffer.expires_at ? (
                          <span className={`offer-expiry-badge ${isOfferExpired ? 'expired' : ''}`}>
                            <Calendar size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                            {isOfferExpired
                              ? t('offerExpired', 'Expired')
                              : `${t('expiresAt', 'Expires')}: ${new Date(activeOffer.expires_at).toLocaleDateString()}`}
                          </span>
                        ) : (
                          <span className="offer-no-expiry-badge">
                            <Clock size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                            {t('noExpirationDate', 'No expiration date')}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="customer-offer-card is-pending">
                      <Gift size={16} />
                      <span>{t('noActiveOfferNotice', 'No current active offer configured for this business yet.')}</span>
                    </div>
                  )}

                  {/* Dual Action CTAs: Show at counter (QR) & Show Membership Token */}
                  <div className="customer-card-actions-row">
                    <button
                      type="button"
                      className="primary-button card-qr-btn"
                      onClick={() => setSelectedMembership(membership)}
                    >
                      <QrCode size={16} />
                      <span>{t('showQrCode', 'Show QR Code')}</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-button card-token-btn"
                      onClick={() => setTokenModalMembership(membership)}
                    >
                      <KeyRound size={15} />
                      <span>{t('showMembershipToken', 'Show Membership Token')}</span>
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {/* Reusable Chronological Activity Log Section */}
      <div style={{ marginTop: '32px' }}>
        <ActivityLogSection
          accessToken={session.access_token}
          initialLimit={2}
          loadBatchSize={20}
          title={t('myLoyaltyActivity', 'My Loyalty Activity')}
          subtitle={t('recentTransactionsSubtitle', 'Your recent stamps, points, and reward redemptions')}
        />
      </div>

      {/* Modal: Camera Join Scanner */}
      {joinScannerOpen && (
        <div className="qr-modal-backdrop" role="presentation" onClick={closeScanner}>
          <section
            className="qr-modal customer-scanner-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('scanBusinessJoinQr', 'Scan Business QR')}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="icon-button qr-close" onClick={closeScanner} aria-label={t('close', 'Close')}>
              <X size={18} />
            </button>
            <div className="brand-mark modal-brand-mark">
              <Camera size={28} />
            </div>
            <p className="eyebrow">{t('joinBusinessProgram', 'Join Loyalty Program')}</p>
            <h2>{t('scanBusinessQr', 'Scan Business QR')}</h2>
            <div id="customer-join-qr-reader" className="customer-join-qr-reader" />
            {scannerError && <p className="form-error">{scannerError}</p>}
            <div className="scanner-modal-actions">
              <button className="secondary-button" onClick={scannerActive ? stopScanner : startScanner}>
                <Camera size={15} /> {scannerActive ? t('stopScanner', 'Stop Scanner') : t('startScanner', 'Start Scanner')}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Enlarge QR Code for Counter Scan */}
      {selectedMembership && (
        <div className="qr-modal-backdrop" role="presentation" onClick={() => setSelectedMembership(null)}>
          <section
            className="qr-modal membership-fullscreen-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('customerMembershipQr', 'Loyalty Card QR')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button qr-close"
              onClick={() => setSelectedMembership(null)}
              aria-label={t('close', 'Close')}
            >
              <X size={18} />
            </button>

            <div className="brand-mark modal-brand-mark">
              <Coffee size={24} strokeWidth={2.5} />
            </div>

            <p className="eyebrow">{t('showAtCounter', 'Show at Counter')}</p>
            <h2>{selectedMembership.loyalty_programs?.businesses?.name || t('loyaltyProgram', 'Loyalty Program')}</h2>
            <p className="modal-program-subtitle">{selectedMembership.loyalty_programs?.name}</p>

            <div className="modal-qr-container">
              <QRCodeSVG
                value={selectedMembership.secure_token}
                size={210}
                level="M"
                includeMargin
                bgColor="#ffffff"
                fgColor="#1d3832"
              />
            </div>

            {/* Token display with copy feedback */}
            <div className="modal-token-box-wrapper">
              <span className="token-box-label">{t('membershipToken', 'Membership Token')}</span>
              <div className="token-copy-row">
                <code className="token-code-display">{selectedMembership.secure_token}</code>
                <button
                  type="button"
                  className="icon-button token-copy-btn"
                  onClick={() => copyToken(selectedMembership.secure_token)}
                  title={t('copyToken', 'Copy Token')}
                  aria-label={t('copyToken', 'Copy Token')}
                >
                  {copiedToken ? <Check size={16} style={{ color: '#2e7d32' }} /> : <Copy size={16} />}
                </button>
              </div>
              {copiedToken && <span className="copied-inline-notice">{t('copied', 'Copied to clipboard!')}</span>}
            </div>

            <p className="heading-copy modal-instruction">
              {t('fullscreenQrInstruction', 'Hold this QR code up to the counter scanner to record your visit.')}
            </p>

            <button
              type="button"
              className="secondary-button modal-done-button"
              onClick={() => setSelectedMembership(null)}
            >
              {t('close', 'Close')}
            </button>
          </section>
        </div>
      )}

      {/* Modal: Dedicated "Show Membership Token" Dialog */}
      {tokenModalMembership && (
        <div className="qr-modal-backdrop" role="presentation" onClick={() => setTokenModalMembership(null)}>
          <section
            className="qr-modal token-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('membershipToken', 'Membership Token')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={20} style={{ color: 'var(--coral, #e05a47)' }} />
                <h3 className="modal-title">{t('membershipToken', 'Membership Token')}</h3>
              </div>
              <button
                type="button"
                className="icon-button modal-close-btn"
                onClick={() => setTokenModalMembership(null)}
                aria-label={t('close', 'Close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="token-modal-content">
              <p className="eyebrow">
                {tokenModalMembership.loyalty_programs?.businesses?.name || t('loyaltyProgram', 'Loyalty Program')}
              </p>
              <p className="heading-copy" style={{ marginBottom: '14px' }}>
                {t(
                  'tokenManualInstruction',
                  'If the counter camera cannot scan your QR code, provide this unique token to the cashier to manually lookup your card.'
                )}
              </p>

              <div className="token-full-display">
                <code className="token-large-code">{tokenModalMembership.secure_token}</code>
                <button
                  type="button"
                  className="primary-button token-action-copy-btn"
                  onClick={() => copyToken(tokenModalMembership.secure_token)}
                >
                  {copiedToken ? (
                    <>
                      <Check size={16} /> <span>{t('copied', 'Copied!')}</span>
                    </>
                  ) : (
                    <>
                      <Copy size={16} /> <span>{t('copyToken', 'Copy Token')}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="modal-form-actions" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: '100%' }}
                  onClick={() => setTokenModalMembership(null)}
                >
                  {t('close', 'Close')}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
