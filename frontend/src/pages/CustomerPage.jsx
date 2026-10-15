import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Coffee, Gift, LogOut, QrCode, Sparkles, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { apiFetch } from '../lib/api'
import PreferencesControls from '../components/PreferencesControls'
import { usePreferences } from '../contexts/usePreferences'

export default function CustomerPage({ session, profile, onSignOut }) {
  const { t } = usePreferences()
  const [memberships, setMemberships] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinScannerOpen, setJoinScannerOpen] = useState(false)
  const [selectedMembership, setSelectedMembership] = useState(null)
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const scannerRef = useRef(null)

  const fetchCustomerData = useCallback(async () => {
    setError('')
    try {
      const result = await apiFetch('/api/customer/memberships', session.access_token)
      setMemberships(result.memberships || [])
      setTransactions(result.transactions || [])
    } catch (requestError) {
      setError(requestError.message || t('couldNotLoadCards'))
    } finally {
      setLoading(false)
    }
  }, [session.access_token, t])

  useEffect(() => {
    let mounted = true
    apiFetch('/api/customer/memberships', session.access_token)
      .then((result) => {
        if (!mounted) return
        setMemberships(result.memberships || [])
        setTransactions(result.transactions || [])
      })
      .catch((requestError) => {
        if (mounted) setError(requestError.message || t('couldNotLoadCards'))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
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

  const handleDecodedJoinCode = useCallback((decodedText) => {
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
  }, [stopScanner])

  const startScanner = useCallback(async () => {
    setScannerError('')
    if (typeof window !== 'undefined' && !window.isSecureContext && !/localhost|127\.0\.0\.1/i.test(window.location.hostname)) {
      setScannerError(t('cameraInsecureOrigin'))
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
          // ignore per-frame parse failures
        }
      )
    } catch (err) {
      const name = err?.name || ''
      const msg = err?.message || String(err || '')
      if (name === 'NotAllowedError' || /permission|denied|allowed/i.test(msg)) {
        setScannerError(t('cameraAccessFailed'))
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || /not found|device/i.test(msg)) {
        setScannerError(t('cameraNotFound'))
      } else if (name === 'NotSupportedError' || /not supported/i.test(msg)) {
        setScannerError(t('cameraScannerUnsupported'))
      } else {
        setScannerError(msg || t('couldNotStartScanner'))
      }
      setScannerActive(false)
    }
  }, [stopScanner, handleDecodedJoinCode, t])

  const closeScanner = useCallback(() => {
    stopScanner()
    setJoinScannerOpen(false)
    setScannerError('')
  }, [stopScanner])

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
          // cleanup on unmount
        }
        scannerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedMembership && !joinScannerOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setSelectedMembership(null)
        closeScanner()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedMembership, joinScannerOpen, closeScanner])

  if (loading) {
    return (
      <div className="app-state">
        <div className="brand-mark loading-pulse"><Coffee size={24} strokeWidth={2.5} /></div>
        <strong>{t('loadingLoyaltyCards')}</strong>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-state">
        <strong>{t('couldNotLoadCards')}</strong>
        <p>{error}</p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <button className="primary-button" onClick={handleRetry}>
            {t('tryAgain')}
          </button>
          <button className="text-button" onClick={onSignOut}>
            {t('signOut')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <main className="customer-page">
      <header className="customer-header">
        <div className="brand-row">
          <div className="brand-mark"><Coffee size={18} strokeWidth={2.5} /></div>
          <span>loyaltea</span>
        </div>
        <div className="customer-header-actions">
          <PreferencesControls compact />
          <span className="customer-profile-name">{profile?.full_name || t('customer')}</span>
          <button className="icon-button" onClick={onSignOut} aria-label={t('signOut')} title={t('signOut')}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="customer-hero">
        <div>
          <p className="eyebrow">{t('loyaltyWallet')}</p>
          <h1>{t('everyVisitCounts')}</h1>
          <p className="heading-copy">{t('scanBusinessToJoin')}</p>
        </div>
        <button className="primary-button" onClick={() => setJoinScannerOpen(true)}>
          <Camera size={16} /> {t('scanBusinessQr')}
        </button>
      </section>

      {memberships.length === 0 ? (
        <section className="customer-empty">
          <Sparkles size={24} />
          <h2>{t('joinFirstProgram')}</h2>
          <p>{t('askBusinessToScan')}</p>
          <button className="primary-button" onClick={() => setJoinScannerOpen(true)}>
            <Camera size={16} /> {t('scanBusinessQr')}
          </button>
        </section>
      ) : (
        <section className="membership-grid">
          {memberships.map((membership) => {
            const program = membership.loyalty_programs || {}
            const isPoints = program.model === 'POINTS'
            const balance = isPoints ? (membership.points_balance || 0) : (membership.stamps_balance || 0)
            const unit = isPoints ? t('points') : t('stamps')

            // Filter active non-expired rewards and sort ascending by requirement
            const rewards = (program.rewards || [])
              .filter((r) => r.is_active && (!r.expires_at || new Date(r.expires_at) > new Date()))
              .sort((a, b) => {
                const costA = isPoints ? (a.required_points || 0) : (a.required_stamps || 0)
                const costB = isPoints ? (b.required_points || 0) : (b.required_stamps || 0)
                return costA - costB
              })

            // Next reward milestone (threshold > balance)
            const nextReward = rewards.find((r) => {
              const cost = isPoints ? (r.required_points || 0) : (r.required_stamps || 0)
              return cost > balance
            })

            // Highest unlocked reward (cost <= balance)
            const unlockedRewards = rewards.filter((r) => {
              const cost = isPoints ? (r.required_points || 0) : (r.required_stamps || 0)
              return balance >= cost
            })
            const highestUnlocked = unlockedRewards.length > 0 ? unlockedRewards[unlockedRewards.length - 1] : null

            // Progress calculation
            let progressPercent = 0
            let targetThreshold = 1
            let milestoneHint = ''

            if (nextReward) {
              targetThreshold = isPoints ? nextReward.required_points : nextReward.required_stamps
              progressPercent = Math.min(100, Math.max(0, Math.round((balance / targetThreshold) * 100)))
              const needed = targetThreshold - balance
              milestoneHint = `${needed} ${unit} ${t('until')} ${nextReward.name}`
            } else if (rewards.length > 0) {
              const topReward = rewards[rewards.length - 1]
              targetThreshold = isPoints ? topReward.required_points : topReward.required_stamps
              progressPercent = 100
              milestoneHint = t('allRewardsUnlocked')
            } else {
              targetThreshold = 1
              progressPercent = 0
              milestoneHint = program.description || t('keepGoing')
            }

            // Clean masked token representation
            const tokenSuffix = membership.secure_token
              ? membership.secure_token.slice(-6).toUpperCase()
              : '••••••'

            return (
              <article className="membership-card" key={membership.id}>
                {/* Header: Business & Program Name + Badges */}
                <div className="membership-card-header">
                  <div className="membership-brand-info">
                    <p className="eyebrow">{program.businesses?.name || t('loyaltyProgram')}</p>
                    <h2 className="membership-program-title">{program.name || t('loyaltyProgram')}</h2>
                  </div>
                  <div className="membership-meta-badges">
                    <span className="membership-model-badge">{unit}</span>
                    <span className="membership-token-badge" title={`${t('cardId')}: ${membership.secure_token}`}>
                      ID: •••• {tokenSuffix}
                    </span>
                  </div>
                </div>

                {/* Hero Section: Balance & Touch-friendly QR thumbnail */}
                <div className="membership-hero-row">
                  <div className="membership-balance-section">
                    <div className="membership-balance">
                      <strong>{balance}</strong>
                      <span>{unit}</span>
                    </div>
                    <div className="membership-milestone-hint">
                      <Sparkles size={14} className="milestone-sparkle" />
                      <span>{milestoneHint}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="membership-qr-touch-target"
                    onClick={() => setSelectedMembership(membership)}
                    aria-label={`${t('tapToEnlargeQr')} - ${program.businesses?.name || ''}`}
                    title={t('tapToEnlargeQr')}
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
                    <span className="qr-touch-label">{t('tapToEnlarge')}</span>
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
                  <div className="membership-progress" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>

                {/* Unlocked Reward Callout Banner (if unlocked) */}
                {highestUnlocked && (
                  <div className="unlocked-reward-banner">
                    <Sparkles size={14} />
                    <span>{t('rewardUnlocked')}: <strong>{highestUnlocked.name}</strong></span>
                  </div>
                )}

                {/* Rewards Milestones List */}
                {rewards.length > 0 && (
                  <div className="membership-rewards">
                    <span className="rewards-section-title">{t('rewards')}</span>
                    {rewards.slice(0, 3).map((reward) => {
                      const threshold = isPoints ? reward.required_points : reward.required_stamps
                      const isUnlocked = balance >= threshold
                      return (
                        <div className={`reward-row ${isUnlocked ? 'reward-unlocked' : ''}`} key={reward.id}>
                          <div className="reward-icon-wrapper">
                            {isUnlocked ? <Check size={14} strokeWidth={2.8} /> : <Gift size={14} />}
                          </div>
                          <div className="reward-details">
                            <span className="reward-name">{reward.name}</span>
                            <small className="reward-cost">{threshold} {unit}</small>
                          </div>
                          {isUnlocked ? (
                            <span className="reward-status-pill unlocked">{t('unlocked')}</span>
                          ) : (
                            <span className="reward-status-pill locked">
                              {threshold - balance} {unit} {t('until')}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Primary Card CTA Button (Min 44px touch target) */}
                <button
                  type="button"
                  className="membership-scan-cta"
                  onClick={() => setSelectedMembership(membership)}
                  aria-label={`${t('showAtCounter')} - ${program.businesses?.name || ''}`}
                >
                  <QrCode size={18} />
                  <span>{t('showAtCounter')}</span>
                </button>
              </article>
            )
          })}
        </section>
      )}

      {transactions.length > 0 && (
        <section className="customer-history">
          <div className="panel-heading">
            <div>
              <h2>{t('recentActivity')}</h2>
              <p>{t('latestLoyaltyMovements')}</p>
            </div>
          </div>
          {transactions.slice(0, 8).map((transaction) => {
            const delta = transaction.stamps_delta || transaction.points_delta
            return (
              <div className="history-row" key={transaction.id}>
                <span>{transaction.type === 'EARN' ? t('loyaltyEarned') : t('rewardRedeemed')}</span>
                <strong className={delta > 0 ? 'history-positive' : 'history-negative'}>
                  {delta > 0 ? '+' : ''}{delta}
                </strong>
                <small>{new Date(transaction.created_at).toLocaleDateString()}</small>
              </div>
            )
          })}
        </section>
      )}

      {joinScannerOpen && (
        <div className="qr-modal-backdrop" role="presentation" onClick={closeScanner}>
          <section
            className="qr-modal customer-scanner-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('scanBusinessJoinQr')}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="icon-button qr-close" onClick={closeScanner} aria-label={t('close')}>
              <X size={18} />
            </button>
            <div className="brand-mark modal-brand-mark"><Camera size={28} /></div>
            <p className="eyebrow">{t('joinBusinessProgram')}</p>
            <h2>{t('scanBusinessQr')}</h2>
            <div id="customer-join-qr-reader" className="customer-join-qr-reader" />
            {scannerError && <p className="form-error">{scannerError}</p>}
            <div className="scanner-modal-actions">
              <button className="secondary-button" onClick={scannerActive ? stopScanner : startScanner}>
                <Camera size={15} /> {scannerActive ? t('stopScanner') : t('startScanner')}
              </button>
            </div>
            <div className="native-camera-hint">
              <p><strong>{t('nativeCameraTitle')}:</strong> {t('orUseNativeCamera')}</p>
            </div>
          </section>
        </div>
      )}

      {selectedMembership && (
        <div className="qr-modal-backdrop" role="presentation" onClick={() => setSelectedMembership(null)}>
          <section
            className="qr-modal membership-fullscreen-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('customerMembershipQr')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button qr-close"
              onClick={() => setSelectedMembership(null)}
              aria-label={t('close')}
            >
              <X size={18} />
            </button>

            <div className="brand-mark modal-brand-mark">
              <Coffee size={24} strokeWidth={2.5} />
            </div>

            <p className="eyebrow">{t('showAtCounter')}</p>
            <h2>{selectedMembership.loyalty_programs?.businesses?.name || t('loyaltyProgram')}</h2>
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

            <div className="modal-membership-meta">
              <span className="modal-balance-badge">
                {selectedMembership.loyalty_programs?.model === 'POINTS'
                  ? selectedMembership.points_balance
                  : selectedMembership.stamps_balance}{' '}
                {selectedMembership.loyalty_programs?.model === 'POINTS' ? t('points') : t('stamps')}
              </span>
              <span className="modal-token-badge">
                {t('cardId')}: •••• {selectedMembership.secure_token.slice(-6).toUpperCase()}
              </span>
            </div>

            <p className="heading-copy modal-instruction">
              {t('fullscreenQrInstruction')}
            </p>

            <button
              type="button"
              className="secondary-button modal-done-button"
              onClick={() => setSelectedMembership(null)}
            >
              {t('close')}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}




