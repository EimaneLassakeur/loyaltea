import { useEffect, useRef, useState } from 'react'
import { Camera, Coins, Gift, Plus, Search, Sparkles, UserRound, X } from 'lucide-react'
import { lookupMembership } from '../../services/dashboardService'
import { usePreferences } from '../../contexts/usePreferences'

export default function EmployeeOperationsPanel({ accessToken, program, onAddLoyalty, onRedeem }) {
  const { t } = usePreferences()
  const [token, setToken] = useState('')
  const [customer, setCustomer] = useState(null)
  const [pointsToAward, setPointsToAward] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scannerActive, setScannerActive] = useState(false)
  const scannerRef = useRef(null)

  useEffect(() => () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) scannerRef.current.stop().catch(() => {})
        scannerRef.current.clear()
      } catch {
        // cleanup on unmount
      }
    }
  }, [])

  const activeOffer = (program?.rewards || []).find((r) => r.is_active && !r.deleted_at)
  const targetThreshold = activeOffer
    ? (program?.model === 'POINTS' ? activeOffer.required_points : activeOffer.required_stamps) || 1
    : 10
  const isUnlocked = activeOffer && customer && customer.stamps >= targetThreshold

  const resolveToken = async (value) => {
    const normalized = value.trim()
    if (!normalized) return
    setBusy(true)
    setError('')
    try {
      const result = await lookupMembership(accessToken, normalized)
      const membership = result.membership
      const balance = membership.loyalty_programs?.model === 'POINTS' ? membership.points_balance : membership.stamps_balance
      const customerName = membership.users?.full_name || membership.customers?.full_name || membership.customers?.email || t('customer')
      const customerContact = membership.customers?.email || membership.users?.phone || membership.customers?.phone || ''
      setCustomer({
        id: membership.id,
        name: customerName,
        email: customerContact,
        stamps: balance,
        unit: membership.loyalty_programs?.model === 'POINTS' ? t('points') : t('stamps'),
      })
      setToken(normalized)
    } catch (requestError) {
      setCustomer(null)
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const handleAward = async () => {
    if (busy || !customer) return
    const isPoints = program?.model === 'POINTS'
    const amount = isPoints ? parseInt(pointsToAward, 10) : 1
    if (isPoints && (!Number.isFinite(amount) || amount <= 0)) {
      setError(t('invalidAwardPoints', 'Please enter a valid number of points'))
      return
    }

    setBusy(true)
    setError('')
    try {
      await onAddLoyalty(customer, amount)
      setCustomer((prev) => (prev ? { ...prev, stamps: prev.stamps + amount } : null))
      setPointsToAward('')
    } catch (awardError) {
      setError(awardError.message || t('couldNotAwardPoints', 'Could not award loyalty points'))
    } finally {
      setBusy(false)
    }
  }

  const handleRedeem = async () => {
    if (busy || !customer) return
    if (!isUnlocked) {
      setError(t('customerNotEligible', 'Customer has not reached the required points for this reward'))
      return
    }

    setBusy(true)
    setError('')
    try {
      await onRedeem(customer)
      // Progress resets atomically to 0 upon reward redemption
      setCustomer((prev) => (prev ? { ...prev, stamps: 0 } : null))
    } catch (redeemError) {
      setError(redeemError.message || t('couldNotRedeem', 'Could not redeem reward'))
    } finally {
      setBusy(false)
    }
  }

  const stopScanner = async () => {
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
  }

  const startScanner = async () => {
    setError('')
    try {
      await stopScanner()
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('employee-qr-reader')
      scannerRef.current = scanner
      setScannerActive(true)
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          resolveToken(decodedText)
          stopScanner()
        },
        () => {
          // ignore per-frame parse failures
        }
      )
    } catch (requestError) {
      setError(requestError.message || t('couldNotStartScanner'))
      setScannerActive(false)
    }
  }

  return (
    <section className="panel employee-operations">
      <div className="panel-heading">
        <div>
          <h2>{t('counterOperations')}</h2>
          <p>{t('identifyCustomerForLoyalty')}</p>
        </div>
        <Camera size={19} />
      </div>

      <div className="lookup-actions">
        <button className="secondary-button" onClick={scannerActive ? stopScanner : startScanner}>
          <Camera size={15} /> {scannerActive ? t('stopScanner') : t('scanCustomerQr')}
        </button>
        <div className="token-search">
          <Search size={15} />
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={t('pasteMembershipToken')}
          />
          <button
            className="icon-button"
            onClick={() => resolveToken(token)}
            disabled={busy}
            aria-label={t('findCustomer')}
          >
            <Search size={15} />
          </button>
        </div>
      </div>

      <div id="employee-qr-reader" className="employee-qr-reader" />

      {error && <p className="form-error" style={{ margin: '10px 0' }}>{error}</p>}

      {customer && (
        <div className="resolved-customer">
          <div className="resolved-customer-title">
            <UserRound size={18} />
            <div>
              <strong>{customer.name}</strong>
              <small>{customer.email}</small>
            </div>
            <button className="icon-button" onClick={() => setCustomer(null)} aria-label={t('clearCustomer')}>
              <X size={16} />
            </button>
          </div>

          <div className="resolved-customer-balance-row">
            <div className="customer-live-balance">
              <span className="balance-num">{customer.stamps}</span>
              <span className="balance-unit">{customer.unit}</span>
            </div>

            {activeOffer && (
              <div className={`counter-offer-status ${isUnlocked ? 'is-ready' : 'in-progress'}`}>
                {isUnlocked ? (
                  <span className="unlocked-pill">
                    <Sparkles size={14} />
                    <strong>{t('rewardReadyToRedeem', 'Reward ready to redeem!')}</strong>
                  </span>
                ) : (
                  <span className="progress-pill">
                    <Gift size={13} />
                    <span>
                      {Math.max(0, targetThreshold - customer.stamps)} {customer.unit} {t('until', 'until')}{' '}
                      <strong>{activeOffer.name}</strong>
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Award points input & action */}
          <div className="counter-award-section">
            {program?.model === 'POINTS' ? (
              <div className="counter-points-entry">
                <label className="field-label" htmlFor="award-points-input">
                  {t('enterPointsToAward', 'Points gained today')}:
                </label>
                <div className="award-input-row">
                  <div className="award-input-wrap">
                    <Coins size={15} className="input-prefix-icon" />
                    <input
                      id="award-points-input"
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      value={pointsToAward}
                      onChange={(e) => setPointsToAward(e.target.value)}
                      placeholder={t('pointsExamplePlaceholder', 'e.g. 322')}
                      className="points-entry-input"
                    />
                  </div>
                  <button
                    type="button"
                    className="primary-button counter-award-btn"
                    onClick={handleAward}
                    disabled={busy || !pointsToAward || Number(pointsToAward) <= 0}
                  >
                    <Plus size={15} />
                    <span>
                      {t('award', 'Award')}{' '}
                      {pointsToAward && Number(pointsToAward) > 0 ? `${pointsToAward} ` : ''}
                      {t('points', 'points')}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="counter-stamps-entry">
                <button
                  type="button"
                  className="primary-button counter-award-btn"
                  onClick={handleAward}
                  disabled={busy}
                >
                  <Plus size={15} />
                  <span>{t('awardOneStamp', 'Award +1 Stamp')}</span>
                </button>
              </div>
            )}

            {/* Redeem reward button */}
            <div className="counter-redeem-wrapper">
              <button
                type="button"
                className={`secondary-button counter-redeem-action-btn ${isUnlocked ? 'is-active-unlocked' : ''}`}
                onClick={handleRedeem}
                disabled={busy || !isUnlocked}
              >
                <Gift size={15} />
                <span>
                  {t('redeemReward', 'Redeem Reward')}
                  {activeOffer ? ` (${activeOffer.name})` : ''}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
