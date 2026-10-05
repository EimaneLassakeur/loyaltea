import { useEffect, useRef, useState } from 'react'
import { Camera, Search, UserRound, X } from 'lucide-react'
import { lookupMembership } from '../../services/dashboardService'
import { usePreferences } from '../../contexts/usePreferences'

export default function EmployeeOperationsPanel({ accessToken, program, onAddLoyalty, onRedeem }) {
  const { t } = usePreferences()
  const [token, setToken] = useState('')
  const [customer, setCustomer] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scannerActive, setScannerActive] = useState(false)
  const scannerRef = useRef(null)

  useEffect(() => () => { if (scannerRef.current) scannerRef.current.clear().catch(() => {}) }, [])

  const resolveToken = async (value) => {
    const normalized = value.trim()
    if (!normalized) return
    setBusy(true)
    setError('')
    try {
      const result = await lookupMembership(accessToken, normalized)
      const membership = result.membership
      const balance = membership.loyalty_programs?.model === 'POINTS' ? membership.points_balance : membership.stamps_balance
      setCustomer({ id: membership.id, name: membership.customers?.email || t('customer'), email: membership.customers?.email || '', stamps: balance, unit: membership.loyalty_programs?.model === 'POINTS' ? t('points') : t('stamps') })
      setToken(normalized)
    } catch (requestError) {
      setCustomer(null)
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) await scannerRef.current.clear().catch(() => {})
    scannerRef.current = null
    setScannerActive(false)
  }

  const startScanner = async () => {
    setError('')
    try {
      await stopScanner()
      const { Html5QrcodeScanner } = await import('html5-qrcode')
      const scanner = new Html5QrcodeScanner('employee-qr-reader', { fps: 10, qrbox: { width: 220, height: 220 } }, false)
      scanner.render((decodedText) => {
        resolveToken(decodedText)
        stopScanner()
      }, (scannerError) => {
        if (/permission|camera|secure context/i.test(String(scannerError))) setError(t('cameraAccessFailed'))
      })
      scannerRef.current = scanner
      setScannerActive(true)
    } catch (requestError) {
      setError(requestError.message || t('couldNotStartScanner'))
      setScannerActive(false)
    }
  }

  return (
    <section className="panel employee-operations">
      <div className="panel-heading"><div><h2>{t('counterOperations')}</h2><p>{t('identifyCustomerForLoyalty')}</p></div><Camera size={19} /></div>
      <div className="lookup-actions"><button className="secondary-button" onClick={scannerActive ? stopScanner : startScanner}><Camera size={15} /> {scannerActive ? t('stopScanner') : t('scanCustomerQr')}</button><div className="token-search"><Search size={15} /><input value={token} onChange={(event) => setToken(event.target.value)} placeholder={t('pasteMembershipToken')} /><button className="icon-button" onClick={() => resolveToken(token)} disabled={busy} aria-label={t('findCustomer')}><Search size={15} /></button></div></div>
      <div id="employee-qr-reader" className="employee-qr-reader" />
      {error && <p className="form-error">{error}</p>}
      {customer && <div className="resolved-customer"><div className="resolved-customer-title"><UserRound size={18} /><div><strong>{customer.name}</strong><small>{customer.email}</small></div><button className="icon-button" onClick={() => setCustomer(null)} aria-label={t('clearCustomer')}><X size={16} /></button></div><p>{customer.stamps} {customer.unit} {t('currentlyAvailable')}</p><div className="resolved-customer-actions"><button className="primary-button" onClick={() => onAddLoyalty(customer)} disabled={busy}>{t('add')} {program?.model === 'POINTS' ? t('points') : t('stamp')}</button><button className="secondary-button" onClick={() => onRedeem(customer)} disabled={busy}>{t('redeemEligibleReward')}</button></div></div>}
    </section>
  )
}
