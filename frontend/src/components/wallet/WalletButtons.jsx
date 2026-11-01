import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { usePreferences } from '../../contexts/usePreferences'
import { apiFetch, buildApiUrl } from '../../lib/api'

// Official Apple Wallet icon mark (pocket with colored cards)
function AppleWalletIcon() {
  return (
    <svg width="24" height="18" viewBox="0 0 24 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="wallet-badge-icon">
      <rect x="1" y="1" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 5.5H23" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 10C16 9.17157 16.6716 8.5 17.5 8.5H23V13.5H17.5C16.6716 13.5 16 12.8284 16 12V10Z" fill="currentColor" />
      <circle cx="19.5" cy="11" r="1" fill="#1b322e" />
    </svg>
  )
}

// Official Google Wallet G Mark
function GoogleWalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="wallet-badge-icon">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function WalletButtons({
  membershipId,
  businessSlug = 'loyaltea',
  accessToken,
  compact = false,
  className = '',
}) {
  const { t } = usePreferences()
  const [downloadingApple, setDownloadingApple] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [appleSuccess, setAppleSuccess] = useState(false)
  const [googleModalInfo, setGoogleModalInfo] = useState(null)
  const [errorNotice, setErrorNotice] = useState('')

  const handleAppleWallet = async () => {
    if (!membershipId || !accessToken || downloadingApple) return
    setErrorNotice('')
    setDownloadingApple(true)

    try {
      const endpoint = buildApiUrl(`/api/wallet/apple/${membershipId}`)
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        let errMsg = t('walletDownloadFailed', 'Failed to download wallet pass.')
        try {
          const errorData = await response.json()
          if (errorData.error) errMsg = errorData.error
        } catch {
          // Response is not json
        }
        throw new Error(errMsg)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('pkpass') && !contentType.includes('octet-stream') && !contentType.includes('zip')) {
        const text = await response.text()
        throw new Error(`Unexpected server response: ${text.slice(0, 80)}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${businessSlug || 'loyaltea'}-loyalty-card.pkpass`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)

      setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 2000)

      setAppleSuccess(true)
      setTimeout(() => setAppleSuccess(false), 3500)
    } catch (err) {
      console.error('Apple Wallet download error:', err)
      setErrorNotice(err.message || t('walletDownloadFailed', 'Failed to download wallet pass.'))
    } finally {
      setDownloadingApple(false)
    }
  }

  const handleGoogleWallet = async () => {
    if (!membershipId || !accessToken || loadingGoogle) return
    setErrorNotice('')
    setLoadingGoogle(true)

    try {
      const data = await apiFetch(`/api/wallet/google/${membershipId}`, accessToken)
      if (data.saveUrl) {
        window.open(data.saveUrl, '_blank')
      } else {
        // Pass model generated in dev mode / review mode
        setGoogleModalInfo(data)
      }
    } catch (err) {
      console.error('Google Wallet error:', err)
      setErrorNotice(err.message || 'Failed to process Google Wallet card')
    } finally {
      setLoadingGoogle(false)
    }
  }

  return (
    <div className={`wallet-integration-wrap ${compact ? 'is-compact' : ''} ${className}`}>
      <div className="wallet-buttons-row">
        {/* Official Apple Wallet Button */}
        <button
          type="button"
          className="wallet-btn apple-wallet-btn"
          onClick={handleAppleWallet}
          disabled={downloadingApple || !membershipId}
          title={t('addToAppleWallet', 'Add to Apple Wallet')}
          aria-label={t('addToAppleWallet', 'Add to Apple Wallet')}
        >
          {downloadingApple ? (
            <Loader2 size={16} className="wallet-btn-spin" />
          ) : appleSuccess ? (
            <Check size={16} className="wallet-btn-success" />
          ) : (
            <AppleWalletIcon />
          )}
          <span className="wallet-btn-text">
            {appleSuccess
              ? t('saved', 'Saved!')
              : downloadingApple
              ? t('walletPassDownloading', 'Preparing...')
              : t('addToAppleWallet', 'Add to Apple Wallet')}
          </span>
        </button>

        {/* Official Google Wallet Button */}
        <button
          type="button"
          className="wallet-btn google-wallet-btn"
          onClick={handleGoogleWallet}
          disabled={loadingGoogle || !membershipId}
          title={t('saveToGoogleWallet', 'Save to Google Wallet')}
          aria-label={t('saveToGoogleWallet', 'Save to Google Wallet')}
        >
          {loadingGoogle ? (
            <Loader2 size={16} className="wallet-btn-spin" />
          ) : (
            <GoogleWalletIcon />
          )}
          <span className="wallet-btn-text">
            {loadingGoogle
              ? t('walletGoogleOpening', 'Opening...')
              : t('saveToGoogleWallet', 'Save to Google Wallet')}
          </span>
        </button>
      </div>

      {errorNotice && <p className="wallet-feedback-error">{errorNotice}</p>}

      {/* Development / Information Modal for Google Wallet Object */}
      {googleModalInfo && (
        <div className="qr-modal-backdrop" role="presentation" onClick={() => setGoogleModalInfo(null)}>
          <div
            className="qr-modal wallet-info-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GoogleWalletIcon />
                <h3>Google Wallet Pass Ready</h3>
              </div>
            </div>
            <div className="wallet-info-body">
              <p>
                Your loyalty card object has been generated for Google Wallet.
              </p>
              <div className="wallet-info-meta">
                <div>
                  <strong>Card Account ID:</strong>
                  <code>{googleModalInfo.loyaltyObject?.accountId}</code>
                </div>
                <div>
                  <strong>Balance:</strong>
                  <span>{googleModalInfo.loyaltyObject?.loyaltyPoints?.balance?.string} {googleModalInfo.loyaltyObject?.loyaltyPoints?.label}</span>
                </div>
                <div>
                  <strong>Status:</strong>
                  <span className="badge badge-success">ACTIVE</span>
                </div>
              </div>
              <p className="wallet-info-note">
                When Google Wallet issuer credentials are configured in your environment, clicking this button immediately adds the pass to Google Wallet on your Android device.
              </p>
            </div>
            <div className="modal-form-actions">
              <button
                type="button"
                className="primary-button"
                style={{ width: '100%' }}
                onClick={() => setGoogleModalInfo(null)}
              >
                {t('close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
