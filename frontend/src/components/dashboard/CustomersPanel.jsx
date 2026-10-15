import { useState } from 'react'
import { Check, ChevronDown, Copy, Eye, Gift, Mail, MessageSquare, Phone, Plus, Search, X } from 'lucide-react'
import { usePreferences } from '../../contexts/usePreferences'

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

export default function CustomersPanel({
  customers,
  program,
  search,
  onSearchChange,
  earnAmount,
  onEarnAmountChange,
  busyMembership,
  onAddLoyalty,
  onRedeem,
}) {
  const { t } = usePreferences()
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [copiedToken, setCopiedToken] = useState(false)

  const activeRewards = (program?.rewards || []).filter((reward) => reward.is_active)
  const sortedThresholds = activeRewards
    .map((reward) => (program?.model === 'STAMPS' ? reward.required_stamps : reward.required_points))
    .sort((a, b) => a - b)
  const primaryThreshold = sortedThresholds[0] || 10

  const copyCardToken = async (token) => {
    if (!token) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(token)
        setCopiedToken(true)
        setTimeout(() => setCopiedToken(false), 2000)
      }
    } catch {
      // ignore clipboard error
    }
  }

  return (
    <section className="panel customers-panel">
      <div className="panel-heading">
        <div>
          <h2>{t('customers')}</h2>
          <p>{t('loyalCustomersCopy')}</p>
        </div>
      </div>

      <div className="customer-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('search')}
          />
        </div>
        {program?.model === 'POINTS' && (
          <label className="amount-field">
            {t('purchaseAmount')}{' '}
            <input
              min="1"
              type="number"
              value={earnAmount}
              onChange={(event) => onEarnAmountChange(event.target.value)}
            />
          </label>
        )}
        <button className="filter-button" disabled title={t('filterNotConfigured')}>
          {t('allCustomers')} <ChevronDown size={15} />
        </button>
      </div>

      <div className="customer-table">
        {customers.length === 0 ? (
          <div className="panel-empty">
            <Search size={22} />
            <strong>{t('noCustomersFound')}</strong>
            <span>{t('customersAppearHere')}</span>
          </div>
        ) : (
          <>
            <div className="table-row table-header">
              <span>{t('customer')}</span>
              <span>{t('progress')}</span>
              <span>{t('status')}</span>
              <span>{t('lastActivity')}</span>
              <span>{t('action')}</span>
            </div>
            {customers.map((customer) => {
              const eligibleReward = activeRewards.some((reward) =>
                program?.model === 'STAMPS'
                  ? customer.stamps >= reward.required_stamps
                  : customer.stamps >= reward.required_points
              )

              return (
                <div className="table-row" key={customer.id}>
                  <div
                    className="customer-name"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedCustomer(customer)}
                    title={t('customerDetails')}
                  >
                    <div className={`customer-avatar ${customer.color}`}>{customer.initials}</div>
                    <div>
                      <strong>{customer.name}</strong>
                      <small>{customer.email || customer.phone || '—'}</small>
                    </div>
                  </div>

                  <div className="progress-cell">
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${Math.min((customer.stamps / primaryThreshold) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {customer.stamps} {customer.unit}
                    </small>
                  </div>

                  <span className={`status-pill ${customer.status === 'Reward ready' ? 'ready' : ''}`}>
                    {customer.status}
                  </span>

                  <span className="last-activity">
                    {new Date(customer.updatedAt).toLocaleDateString()}
                  </span>

                  <div className="row-actions">
                    <button
                      className="row-action"
                      onClick={() => setSelectedCustomer(customer)}
                      aria-label={`${t('customerDetails')} - ${customer.name}`}
                      title={t('customerDetails')}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="row-action"
                      disabled={busyMembership === customer.id}
                      onClick={() => onAddLoyalty(customer)}
                      aria-label={`Add ${customer.unit} to ${customer.name}`}
                      title={`Add ${customer.unit}`}
                    >
                      <Plus size={17} />
                    </button>
                    {eligibleReward && (
                      <button
                        className="row-action redeem-action"
                        disabled={busyMembership === customer.id}
                        onClick={() => onRedeem(customer)}
                        aria-label={`Redeem reward for ${customer.name}`}
                        title="Redeem reward"
                      >
                        <Gift size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Customer Details Modal */}
      {selectedCustomer && (
        <div
          className="qr-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="qr-modal customer-details-modal customer-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('customerDetails')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="customer-modal-header">
              <div className="customer-modal-identity">
                <div
                  className={`customer-avatar ${selectedCustomer.color}`}
                  style={{ width: '40px', height: '40px', fontSize: '15px' }}
                >
                  {selectedCustomer.initials}
                </div>
                <div className="customer-modal-title-group">
                  <h3 className="customer-modal-name">{selectedCustomer.name}</h3>
                  <span className={`status-pill ${selectedCustomer.isActive ? 'ready' : ''}`}>
                    {selectedCustomer.isActive ? t('active') : t('inactive')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="icon-button modal-close-btn"
                onClick={() => setSelectedCustomer(null)}
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="settings-list customer-modal-list">
              <div>
                <span>{t('membershipCardId')}</span>
                <div className="customer-card-id-row">
                  <code className="customer-card-code">
                    {selectedCustomer.cardId
                      ? `•••• ${selectedCustomer.cardId.slice(-6).toUpperCase()}`
                      : '—'}
                  </code>
                  {selectedCustomer.cardId && (
                    <button
                      type="button"
                      className="icon-button copy-token-btn"
                      onClick={() => copyCardToken(selectedCustomer.cardId)}
                      title={t('copyCardId')}
                      aria-label={t('copyCardId')}
                    >
                      {copiedToken ? <Check size={14} color="var(--accent, #438a72)" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span>{selectedCustomer.unit === 'stamps' ? t('stamps') : t('points')}</span>
                <strong className="customer-balance-highlight">
                  {selectedCustomer.stamps} {selectedCustomer.unit}
                </strong>
              </div>

              <div>
                <span>{t('email')}</span>
                {selectedCustomer.email ? (
                  <a
                    href={`mailto:${selectedCustomer.email}`}
                    className="contact-link"
                  >
                    <Mail size={13} />
                    <span className="contact-text">{selectedCustomer.email}</span>
                  </a>
                ) : (
                  <span className="detail-value">—</span>
                )}
              </div>

              <div>
                <span>{t('phone')}</span>
                {selectedCustomer.phone ? (
                  <a
                    href={`tel:${selectedCustomer.phone}`}
                    className="contact-link"
                  >
                    <Phone size={13} />
                    <span className="contact-text">{selectedCustomer.phone}</span>
                  </a>
                ) : (
                  <span className="detail-value">—</span>
                )}
              </div>

              <div>
                <span>{t('memberSince')}</span>
                <strong className="detail-value">
                  {selectedCustomer.joinedAt
                    ? new Date(selectedCustomer.joinedAt).toLocaleDateString()
                    : selectedCustomer.updatedAt
                    ? new Date(selectedCustomer.updatedAt).toLocaleDateString()
                    : '—'}
                </strong>
              </div>
            </div>

            {/* Direct Contact Action Buttons */}
            <div className="customer-modal-contact-actions">
              {selectedCustomer.email && (
                <a
                  href={`mailto:${selectedCustomer.email}`}
                  className="secondary-button customer-action-btn"
                >
                  <Mail size={14} /> <span>{t('sendEmail')}</span>
                </a>
              )}
              {selectedCustomer.phone && (
                <a
                  href={`tel:${selectedCustomer.phone}`}
                  className="secondary-button customer-action-btn"
                >
                  <Phone size={14} /> <span>{t('call')}</span>
                </a>
              )}
              {formatWhatsappUrl(selectedCustomer.phone) && (
                <a
                  href={formatWhatsappUrl(selectedCustomer.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="secondary-button whatsapp-button customer-action-btn"
                >
                  <MessageSquare size={14} /> <span>WhatsApp</span>
                </a>
              )}
            </div>

            {/* Loyalty Quick Actions in Modal */}
            <div className="customer-modal-loyalty-actions">
              <button
                type="button"
                className="primary-button loyalty-action-btn"
                disabled={busyMembership === selectedCustomer.id}
                onClick={() => {
                  onAddLoyalty(selectedCustomer)
                  setSelectedCustomer(null)
                }}
              >
                <Plus size={15} /> <span>{t('add')} {selectedCustomer.unit}</span>
              </button>
              {activeRewards.some((reward) =>
                program?.model === 'STAMPS'
                  ? selectedCustomer.stamps >= reward.required_stamps
                  : selectedCustomer.stamps >= reward.required_points
              ) && (
                <button
                  type="button"
                  className="secondary-button redeem-action-btn loyalty-action-btn"
                  disabled={busyMembership === selectedCustomer.id}
                  onClick={() => {
                    onRedeem(selectedCustomer)
                    setSelectedCustomer(null)
                  }}
                >
                  <Gift size={15} /> <span>{t('redeemedReward')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
