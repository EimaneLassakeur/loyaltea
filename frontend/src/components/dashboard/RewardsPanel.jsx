import { useState } from 'react'
import {
  Calendar,
  CheckCircle,
  Coins,
  Edit2,
  Gift,
  Info,
  Plus,
  Power,
  Stamp,
  Trash2,
  X,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { usePreferences } from '../../contexts/usePreferences'

export default function RewardsPanel({ program, _businessId, accessToken, onProgramUpdate }) {
  const { t } = usePreferences()

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    threshold: '10',
    expires_at: '',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [editingReward, setEditingReward] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    threshold: '10',
    expires_at: '',
    is_active: true,
  })
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')

  // Toast feedback
  const [actionNotice, setActionNotice] = useState('')

  const showNotice = (msg) => {
    setActionNotice(msg)
    setTimeout(() => setActionNotice(''), 3500)
  }

  const allRewards = program?.rewards || []
  const isPoints = program?.model === 'POINTS'
  const unit = isPoints ? t('points', 'points') : t('stamps', 'stamps')

  const activeOffer = allRewards.find((r) => r.is_active)
  const inactiveOffers = allRewards.filter((r) => !r.is_active)

  // Handle creating a new offer
  const handleCreateOffer = async (e) => {
    e.preventDefault()
    if (!accessToken) return
    if (!program?.id) {
      setCreateError(t('noProgramConfigured', 'No loyalty program found for this business.'))
      return
    }

    if (activeOffer) {
      setCreateError(
        t(
          'activeOfferExistsError',
          'Only one active offer is allowed at a time. Please deactivate the current active offer first.'
        )
      )
      return
    }

    setCreating(true)
    setCreateError('')
    try {
      const thresholdVal = Math.max(1, parseInt(createForm.threshold, 10) || 1)
      const payload = {
        program_id: program.id,
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        required_stamps: !isPoints ? thresholdVal : undefined,
        required_points: isPoints ? thresholdVal : undefined,
        expires_at: createForm.expires_at ? new Date(createForm.expires_at).toISOString() : undefined,
        is_active: true,
      }

      await apiFetch('/api/rewards', accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setShowCreateModal(false)
      setCreateForm({ name: '', description: '', threshold: '10', expires_at: '' })
      showNotice(t('offerCreated', 'Offer created successfully'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      setCreateError(err.message || t('couldNotCreateOffer', 'Could not create offer'))
    } finally {
      setCreating(false)
    }
  }

  // Open edit modal
  const startEditOffer = (reward) => {
    setEditingReward(reward)
    const threshold = String(
      isPoints ? reward.required_points || 10 : reward.required_stamps || 10
    )
    setEditForm({
      name: reward.name || '',
      description: reward.description || '',
      threshold,
      expires_at: reward.expires_at ? reward.expires_at.slice(0, 10) : '',
      is_active: reward.is_active ?? true,
    })
    setUpdateError('')
  }

  // Handle updating an existing offer
  const handleUpdateOffer = async (e) => {
    e.preventDefault()
    if (!editingReward?.id || !accessToken) return

    // If attempting to activate this offer while another active offer exists
    if (!editingReward.is_active && editForm.is_active && activeOffer && activeOffer.id !== editingReward.id) {
      setUpdateError(
        t(
          'activeOfferExistsError',
          'Only one active offer is allowed at a time. Please deactivate the current active offer first.'
        )
      )
      return
    }

    setUpdating(true)
    setUpdateError('')
    try {
      const thresholdVal = Math.max(1, parseInt(editForm.threshold, 10) || 1)
      const payload = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        required_stamps: !isPoints ? thresholdVal : undefined,
        required_points: isPoints ? thresholdVal : undefined,
        expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
        is_active: editForm.is_active,
      }

      await apiFetch(`/api/rewards/${editingReward.id}`, accessToken, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })

      setEditingReward(null)
      showNotice(t('offerUpdated', 'Offer updated successfully'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      setUpdateError(err.message || t('couldNotUpdateOffer', 'Could not update offer'))
    } finally {
      setUpdating(false)
    }
  }

  // Toggle active status directly
  const handleToggleActive = async (reward) => {
    if (!reward?.id || !accessToken) return

    // If activating and another offer is already active, prevent and show notice
    if (!reward.is_active && activeOffer && activeOffer.id !== reward.id) {
      showNotice(
        t(
          'activeOfferExistsNotice',
          'Another offer is currently active. Deactivate it first before activating this offer.'
        )
      )
      return
    }

    try {
      await apiFetch(`/api/rewards/${reward.id}`, accessToken, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !reward.is_active }),
      })
      showNotice(reward.is_active ? t('offerDeactivated', 'Offer deactivated') : t('offerActivated', 'Offer activated'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      showNotice(err.message)
    }
  }

  // Delete offer
  const handleDeleteOffer = async (reward) => {
    if (!reward?.id || !accessToken) return
    if (!window.confirm(t('deleteOfferConfirm', 'Are you sure you want to delete this offer?'))) return

    try {
      await apiFetch(`/api/rewards/${reward.id}`, accessToken, {
        method: 'DELETE',
      })
      showNotice(t('offerDeleted', 'Offer deleted'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      showNotice(err.message)
    }
  }

  const renderOfferCard = (reward, isActiveCard = false) => {
    const threshold = isPoints ? reward.required_points || 0 : reward.required_stamps || 0
    const isExpired = reward.expires_at && new Date(reward.expires_at) <= new Date()

    return (
      <article
        className={`reward-management-row ${!reward.is_active ? 'is-inactive' : ''} ${
          isActiveCard ? 'active-offer-card' : ''
        }`}
        key={reward.id}
      >
        <div className="reward-info-col">
          <div className="reward-icon" aria-hidden="true">
            {isPoints ? <Coins size={20} /> : <Gift size={20} />}
          </div>
          <div className="reward-text-details">
            <div className="reward-title-row">
              <strong className="reward-name">{reward.name}</strong>
              <span
                className={`status-pill ${
                  reward.is_active && !isExpired ? 'ready' : isExpired ? 'paused' : ''
                }`}
              >
                {!reward.is_active ? t('inactive', 'Inactive') : isExpired ? t('expired', 'Expired') : t('active', 'Active')}
              </span>
            </div>
            <p className="reward-description">{reward.description || t('noDescription', 'No description provided')}</p>
            <div className="reward-meta-row">
              <span className="reward-threshold-badge">
                {threshold} {unit} {t('requiredToRedeem', 'required')}
              </span>
              {reward.expires_at ? (
                <span className={`reward-expiry ${isExpired ? 'is-expired' : ''}`}>
                  <Calendar size={13} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                  {t('expiresAt', 'Expires')}: {new Date(reward.expires_at).toLocaleDateString()}
                </span>
              ) : (
                <span className="reward-no-expiry">
                  {t('noExpirationDate', 'No expiration date')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="reward-actions-col">
          <div className="reward-button-group">
            <button
              type="button"
              className="icon-button"
              onClick={() => startEditOffer(reward)}
              title={t('editOffer', 'Edit offer')}
              aria-label={`${t('editOffer', 'Edit offer')} - ${reward.name}`}
            >
              <Edit2 size={15} />
            </button>

            <button
              type="button"
              className={`icon-button ${reward.is_active ? 'accent-icon' : ''}`}
              onClick={() => handleToggleActive(reward)}
              title={reward.is_active ? t('deactivate', 'Deactivate') : t('activate', 'Activate')}
              aria-label={`${reward.is_active ? t('deactivate', 'Deactivate') : t('activate', 'Activate')} - ${reward.name}`}
            >
              <Power size={15} />
            </button>

            <button
              type="button"
              className="icon-button danger-icon"
              onClick={() => handleDeleteOffer(reward)}
              title={t('deleteOffer', 'Delete offer')}
              aria-label={`${t('deleteOffer', 'Delete offer')} - ${reward.name}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <div className="rewards-management-wrapper">
      {/* Toast Notice */}
      {actionNotice && (
        <div className="toast">
          <span className="toast-check">✓</span>
          {actionNotice}
        </div>
      )}

      {/* Rewards & Offers Header Section */}
      <section className="panel rewards-panel">
        <div className="panel-heading rewards-panel-heading">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2>{t('businessOffers', 'Loyalty Offers')}</h2>
              <span className="status-pill ready">
                {isPoints ? <Coins size={12} style={{ marginRight: '4px' }} /> : <Stamp size={12} style={{ marginRight: '4px' }} />}
                {isPoints ? t('pointsModel', 'Points') : t('stampsModel', 'Stamps')}
              </span>
            </div>
            <p>{t('singleActiveOfferSubtitle', 'Manage your customer loyalty offer. Each business can have one active offer at a time.')}</p>
          </div>
          <button
            type="button"
            className="primary-button add-offer-btn"
            onClick={() => {
              if (activeOffer) {
                showNotice(
                  t(
                    'activeOfferExistsNotice',
                    'Another offer is currently active. Deactivate it first before creating a new active offer.'
                  )
                )
              } else {
                setShowCreateModal(true)
              }
            }}
          >
            <Plus size={16} /> <span>{t('createOffer', 'Create Offer')}</span>
          </button>
        </div>

        {/* Informational constraint callout */}
        <div className="offer-rule-banner">
          <Info size={16} className="rule-icon" />
          <span>
            {t(
              'singleOfferRuleNotice',
              'To keep loyalty simple for your customers, only one offer can be active at a time. Customers accumulate progress toward this active offer.'
            )}
          </span>
        </div>

        {/* 1. Active Offer Section */}
        <div className="active-offer-container" style={{ marginTop: '20px' }}>
          <h3 className="section-subheading">
            <CheckCircle size={16} style={{ color: 'var(--coral-deep, #e65100)', marginRight: '6px' }} />
            {t('currentActiveOffer', 'Current Active Offer')}
          </h3>

          {activeOffer ? (
            <div className="active-offer-wrapper">
              {renderOfferCard(activeOffer, true)}
            </div>
          ) : (
            <div className="panel-empty no-active-offer-empty">
              <Gift size={28} />
              <strong>{t('noActiveOffer', 'No active offer running')}</strong>
              <span>
                {t(
                  'createOfferToStart',
                  'Create an offer or activate an existing one below so your customers can start earning rewards.'
                )}
              </span>
              <button
                type="button"
                className="primary-button"
                style={{ marginTop: '12px' }}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={15} /> {t('createOffer', 'Create Offer')}
              </button>
            </div>
          )}
        </div>

        {/* 2. Inactive / Past Offers Section */}
        {inactiveOffers.length > 0 && (
          <div className="inactive-offers-container" style={{ marginTop: '32px' }}>
            <h3 className="section-subheading">
              {t('pastAndInactiveOffers', 'Past & Inactive Offers')} ({inactiveOffers.length})
            </h3>
            <div className="reward-management-list">
              {inactiveOffers.map((reward) => renderOfferCard(reward, false))}
            </div>
          </div>
        )}
      </section>

      {/* Modal: Create Offer */}
      {showCreateModal && (
        <div className="qr-modal-backdrop" role="presentation" onClick={() => setShowCreateModal(false)}>
          <div
            className="qr-modal reward-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('createOffer', 'Create Offer')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">{t('createOffer', 'Create Offer')}</h3>
              <button
                type="button"
                className="icon-button modal-close-btn"
                onClick={() => setShowCreateModal(false)}
                aria-label={t('close', 'Close')}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateOffer} className="modal-form">
              <label>
                <span>{t('offerTitle', 'Offer Title')} *</span>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder={t('offerTitlePlaceholder', 'e.g. Free Coffee or 20% Discount')}
                />
              </label>

              <label>
                <span>{t('offerDescription', 'Description (What the customer receives)')}</span>
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder={t('offerDescPlaceholder', 'e.g. Valid for any large coffee drink')}
                />
              </label>

              <label>
                <span>
                  {isPoints ? t('requiredPoints', 'Points Required') : t('requiredStamps', 'Stamps Required')} *
                </span>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={createForm.threshold}
                  onChange={(e) => setCreateForm({ ...createForm, threshold: e.target.value })}
                />
              </label>

              <label>
                <span>
                  {t('expiresAt', 'Expiration Date')}{' '}
                  <small style={{ color: 'var(--muted)' }}>({t('optional', 'Optional')})</small>
                </span>
                <input
                  type="date"
                  value={createForm.expires_at}
                  onChange={(e) => setCreateForm({ ...createForm, expires_at: e.target.value })}
                />
              </label>

              {createError && <p className="form-error">{createError}</p>}

              <div className="modal-form-actions">
                <button className="secondary-button" type="button" onClick={() => setShowCreateModal(false)}>
                  {t('close', 'Close')}
                </button>
                <button className="primary-button" type="submit" disabled={creating}>
                  {creating ? t('saving', 'Saving...') : t('createOffer', 'Create Offer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Offer */}
      {editingReward && (
        <div className="qr-modal-backdrop" role="presentation" onClick={() => setEditingReward(null)}>
          <div
            className="qr-modal reward-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('editOffer', 'Edit Offer')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">{t('editOffer', 'Edit Offer')}</h3>
              <button
                type="button"
                className="icon-button modal-close-btn"
                onClick={() => setEditingReward(null)}
                aria-label={t('close', 'Close')}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateOffer} className="modal-form">
              <label>
                <span>{t('offerTitle', 'Offer Title')} *</span>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </label>

              <label>
                <span>{t('offerDescription', 'Description')}</span>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </label>

              <label>
                <span>
                  {isPoints ? t('requiredPoints', 'Points Required') : t('requiredStamps', 'Stamps Required')} *
                </span>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={editForm.threshold}
                  onChange={(e) => setEditForm({ ...editForm, threshold: e.target.value })}
                />
              </label>

              <label>
                <span>
                  {t('expiresAt', 'Expiration Date')}{' '}
                  <small style={{ color: 'var(--muted)' }}>({t('optional', 'Optional')})</small>
                </span>
                <input
                  type="date"
                  value={editForm.expires_at}
                  onChange={(e) => setEditForm({ ...editForm, expires_at: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                />
                <span>{t('active', 'Active')}</span>
              </label>

              {updateError && <p className="form-error">{updateError}</p>}

              <div className="modal-form-actions">
                <button className="secondary-button" type="button" onClick={() => setEditingReward(null)}>
                  {t('close', 'Close')}
                </button>
                <button className="primary-button" type="submit" disabled={updating}>
                  {updating ? t('saving', 'Saving...') : t('saveChanges', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
