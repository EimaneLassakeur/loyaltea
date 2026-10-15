import { useState } from 'react'
import {
  AlertCircle,
  Check,
  Coins,
  Edit2,
  Gift,
  Plus,
  Power,
  Save,
  SlidersHorizontal,
  Stamp,
  Trash2,
  X,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { usePreferences } from '../../contexts/usePreferences'

export default function RewardsPanel({ program, businessId, accessToken, onProgramUpdate }) {
  const { t } = usePreferences()

  // Program configuration state
  const [progForm, setProgForm] = useState({
    name: program?.name || '',
    description: program?.description || '',
    model: program?.model || 'STAMPS',
    points_per_currency: program?.points_per_currency || '1',
    currency_unit: program?.currency_unit || 'DZD',
    is_active: program?.is_active ?? true,
  })
  const [progSaving, setProgSaving] = useState(false)
  const [progMessage, setProgMessage] = useState('')
  const [progError, setProgError] = useState('')

  // Sync form state when program prop changes without cascading effect renders
  const [prevProgram, setPrevProgram] = useState(program)
  if (program !== prevProgram) {
    setPrevProgram(program)
    if (program) {
      setProgForm({
        name: program.name || '',
        description: program.description || '',
        model: program.model || 'STAMPS',
        points_per_currency: program.points_per_currency || '1',
        currency_unit: program.currency_unit || 'DZD',
        is_active: program.is_active ?? true,
      })
    }
  }

  // New offer form state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    threshold: '10',
    expires_at: '',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit offer modal state
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

  // General feedback
  const [actionNotice, setActionNotice] = useState('')

  const showNotice = (msg) => {
    setActionNotice(msg)
    setTimeout(() => setActionNotice(''), 3000)
  }

  // Handle program settings update or create
  const handleSaveProgram = async (e) => {
    e.preventDefault()
    if (!accessToken) return
    const activeBusinessId = businessId || program?.business_id
    if (!program?.id && !activeBusinessId) {
      setProgError(t('noWorkspace') || 'No business found to configure loyalty program')
      return
    }

    const trimmedName = progForm.name.trim()
    if (!trimmedName) {
      setProgError(t('programNameRequired'))
      return
    }

    let parsedPpc = null
    if (progForm.model === 'POINTS') {
      const val = Number(progForm.points_per_currency)
      if (Number.isNaN(val) || val <= 0) {
        setProgError(t('invalidPointsPerCurrency'))
        return
      }
      parsedPpc = val
    }

    setProgSaving(true)
    setProgMessage('')
    setProgError('')
    try {
      const payload = {
        name: trimmedName,
        description: progForm.description.trim() || null,
        model: progForm.model,
        points_per_currency: parsedPpc,
        currency_unit: progForm.currency_unit.trim() || 'DZD',
        is_active: progForm.is_active,
      }

      if (program?.id) {
        await apiFetch(`/api/programs/${program.id}`, accessToken, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch('/api/programs', accessToken, {
          method: 'POST',
          body: JSON.stringify({
            business_id: activeBusinessId,
            ...payload,
          }),
        })
      }
      setProgMessage(t('programSettingsSaved'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      setProgError(err.message || 'Could not save program settings')
    } finally {
      setProgSaving(false)
    }
  }

  // Handle creating a new offer
  const handleCreateOffer = async (e) => {
    e.preventDefault()
    if (!program?.id || !accessToken) return
    setCreating(true)
    setCreateError('')
    try {
      const isPoints = program.model === 'POINTS'
      const payload = {
        program_id: program.id,
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        required_stamps: !isPoints ? Math.max(1, parseInt(createForm.threshold, 10)) : undefined,
        required_points: isPoints ? Math.max(1, parseInt(createForm.threshold, 10)) : undefined,
        expires_at: createForm.expires_at ? new Date(createForm.expires_at).toISOString() : undefined,
        is_active: true,
      }
      await apiFetch('/api/rewards', accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setShowCreateModal(false)
      setCreateForm({ name: '', description: '', threshold: '10', expires_at: '' })
      showNotice(t('offerCreated'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      setCreateError(err.message || 'Could not create offer')
    } finally {
      setCreating(false)
    }
  }

  // Open edit modal
  const startEditOffer = (reward) => {
    setEditingReward(reward)
    const isPoints = program?.model === 'POINTS'
    setEditForm({
      name: reward.name || '',
      description: reward.description || '',
      threshold: String(isPoints ? (reward.required_points || 10) : (reward.required_stamps || 10)),
      expires_at: reward.expires_at ? reward.expires_at.slice(0, 10) : '',
      is_active: reward.is_active ?? true,
    })
    setUpdateError('')
  }

  // Handle updating an existing offer
  const handleUpdateOffer = async (e) => {
    e.preventDefault()
    if (!editingReward?.id || !accessToken) return
    setUpdating(true)
    setUpdateError('')
    try {
      const isPoints = program?.model === 'POINTS'
      const payload = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        required_stamps: !isPoints ? Math.max(1, parseInt(editForm.threshold, 10)) : undefined,
        required_points: isPoints ? Math.max(1, parseInt(editForm.threshold, 10)) : undefined,
        expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
        is_active: editForm.is_active,
      }
      await apiFetch(`/api/rewards/${editingReward.id}`, accessToken, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setEditingReward(null)
      showNotice(t('offerUpdated'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      setUpdateError(err.message || 'Could not update offer')
    } finally {
      setUpdating(false)
    }
  }

  // Toggle active status directly
  const handleToggleActive = async (reward) => {
    if (!reward?.id || !accessToken) return
    try {
      await apiFetch(`/api/rewards/${reward.id}`, accessToken, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !reward.is_active }),
      })
      showNotice(reward.is_active ? t('offerDeleted') : t('offerUpdated'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      showNotice(err.message)
    }
  }

  // Delete offer (soft deactivates if redemptions exist, deletes otherwise)
  const handleDeleteOffer = async (reward) => {
    if (!reward?.id || !accessToken) return
    if (!window.confirm(`${t('deleteOfferConfirm')}`)) return
    try {
      await apiFetch(`/api/rewards/${reward.id}`, accessToken, {
        method: 'DELETE',
      })
      showNotice(t('offerDeleted'))
      if (onProgramUpdate) await onProgramUpdate()
    } catch (err) {
      showNotice(err.message)
    }
  }

  const allRewards = program?.rewards || []
  const isPoints = program?.model === 'POINTS'

  return (
    <div className="rewards-management-wrapper">
      {/* Toast Notice */}
      {actionNotice && <div className="toast"><span className="toast-check">✓</span>{actionNotice}</div>}

      {/* 1. Loyalty Program Configuration Card */}
      <section className="panel program-config-panel">
        <div className="panel-heading program-config-heading">
          <div className="program-heading-main">
            <div className="program-heading-icon" aria-hidden="true">
              <SlidersHorizontal size={20} />
            </div>
            <div className="program-heading-text">
              <div className="program-heading-title-row">
                <h2>{t('programConfiguration')}</h2>
                <span className={`status-pill program-live-pill ${progForm.is_active ? 'ready' : 'paused'}`}>
                  <span className="live-dot" />
                  {progForm.is_active ? t('programActive') : t('programInactive')}
                </span>
              </div>
              <p>{t('manageOffersSubtitle')}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveProgram} className="program-config-form">
          <div className="program-form-grid">
            {/* Program Name */}
            <div className="form-field-wrapper field-program-name">
              <label htmlFor="prog-name" className="form-field-label">
                <span>{t('programName')}</span>
                <span className="required-star" aria-hidden="true">*</span>
              </label>
              <input
                id="prog-name"
                required
                value={progForm.name}
                onChange={(e) => setProgForm({ ...progForm, name: e.target.value })}
                placeholder="e.g. VIP Club"
                className="modern-input"
              />
            </div>

            {/* Loyalty Model */}
            <div className="form-field-wrapper field-program-model">
              <label htmlFor="prog-model" className="form-field-label">
                <span>{t('programModel')}</span>
                <span className="required-star" aria-hidden="true">*</span>
              </label>
              <div className="modern-select-wrapper">
                <select
                  id="prog-model"
                  value={progForm.model}
                  onChange={(e) => setProgForm({ ...progForm, model: e.target.value })}
                  className="modern-select"
                >
                  <option value="STAMPS">{t('stampsModel')}</option>
                  <option value="POINTS">{t('pointsModel')}</option>
                </select>
              </div>
            </div>

            {/* Currency Unit */}
            <div className="form-field-wrapper field-currency-unit">
              <label htmlFor="prog-currency" className="form-field-label">
                <span>{t('currencyUnit')}</span>
                <span className="required-star" aria-hidden="true">*</span>
              </label>
              <input
                id="prog-currency"
                required
                value={progForm.currency_unit}
                onChange={(e) => setProgForm({ ...progForm, currency_unit: e.target.value.toUpperCase() })}
                placeholder="DZD"
                className="modern-input uppercase-input"
                maxLength={6}
              />
            </div>

            {/* Points per Currency (dynamic when POINTS) */}
            {progForm.model === 'POINTS' && (
              <div className="form-field-wrapper field-points-ratio">
                <label htmlFor="prog-ratio" className="form-field-label">
                  <span>{t('pointsPerCurrency')}</span>
                  <span className="required-star" aria-hidden="true">*</span>
                </label>
                <div className="input-with-badge">
                  <input
                    id="prog-ratio"
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={progForm.points_per_currency}
                    onChange={(e) => setProgForm({ ...progForm, points_per_currency: e.target.value })}
                    className="modern-input"
                  />
                  <span className="input-badge-suffix">
                    {t('points') || 'pts'} / {progForm.currency_unit || 'DZD'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Model Informative Helper Callout */}
          <div className="model-info-banner">
            <div className="model-info-icon" aria-hidden="true">
              {progForm.model === 'POINTS' ? <Coins size={16} /> : <Stamp size={16} />}
            </div>
            <div className="model-info-text">
              <strong>
                {progForm.model === 'POINTS' ? t('pointsModel') : t('stampsModel')}
              </strong>
              <span>
                {progForm.model === 'POINTS'
                  ? `1 ${progForm.currency_unit || 'DZD'} = ${progForm.points_per_currency || 1} ${t('points')}`
                  : '1 visit = 1 stamp'}
              </span>
            </div>
          </div>

          {/* Program Description */}
          <div className="form-field-wrapper field-full-width">
            <label htmlFor="prog-description" className="form-field-label">
              <span>{t('programDescription')}</span>
            </label>
            <input
              id="prog-description"
              value={progForm.description}
              onChange={(e) => setProgForm({ ...progForm, description: e.target.value })}
              placeholder="e.g. Earn rewards with every visit"
              className="modern-input"
            />
          </div>

          {/* Modern Status Control Card */}
          <div className={`program-status-banner ${progForm.is_active ? 'is-active' : 'is-paused'}`}>
            <div className="status-banner-info">
              <div className="status-banner-icon" aria-hidden="true">
                <Power size={18} />
              </div>
              <div className="status-banner-copy">
                <strong>{t('programStatus')}</strong>
                <p>
                  {progForm.is_active ? t('programActive') : t('programInactive')}
                </p>
              </div>
            </div>
            <button
              type="button"
              className={`program-status-toggle-btn ${progForm.is_active ? 'active-mode' : 'paused-mode'}`}
              onClick={() => setProgForm({ ...progForm, is_active: !progForm.is_active })}
              aria-pressed={progForm.is_active}
            >
              <Power size={15} />
              <span>{progForm.is_active ? t('deactivate') : t('activate')}</span>
            </button>
          </div>

          {/* Validation & Feedback Notices */}
          {progMessage && (
            <div className="config-alert config-alert-success" role="status">
              <Check size={16} className="alert-icon" />
              <span>{progMessage}</span>
            </div>
          )}
          {progError && (
            <div className="config-alert config-alert-error" role="alert">
              <AlertCircle size={16} className="alert-icon" />
              <span>{progError}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="program-config-footer">
            <button className="primary-button program-save-button" type="submit" disabled={progSaving}>
              {progSaving ? (
                <span>{t('saving') || 'Saving...'}</span>
              ) : (
                <>
                  <Save size={15} />
                  <span>{t('saveProgramSettings')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Customer Offers & Rewards Panel */}
      <section className="panel rewards-panel">
        <div className="panel-heading rewards-panel-heading">
          <div>
            <h2>{t('rewards')}</h2>
            <p>{t('rewardsConfiguredFor')} {program?.name || t('thisProgram')}</p>
          </div>
          <button type="button" className="primary-button add-offer-btn" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> <span>{t('createOffer')}</span>
          </button>
        </div>

        {allRewards.length === 0 ? (
          <div className="panel-empty">
            <Gift size={24} />
            <strong>{t('noRewardsYet')}</strong>
            <span>{t('manageOffersSubtitle')}</span>
            <button type="button" className="primary-button add-offer-btn" style={{ marginTop: '14px' }} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> <span>{t('createOffer')}</span>
            </button>
          </div>
        ) : (
          <div className="reward-management-list">
            {allRewards.map((reward) => {
              const threshold = isPoints ? (reward.required_points || 0) : (reward.required_stamps || 0)
              const unit = isPoints ? t('points') : t('stamps')
              const isExpired = reward.expires_at && new Date(reward.expires_at) <= new Date()

              return (
                <article
                  className={`reward-management-row ${!reward.is_active ? 'is-inactive' : ''}`}
                  key={reward.id}
                >
                  <div className="reward-info-col">
                    <div className="reward-icon" aria-hidden="true">
                      <Gift size={18} />
                    </div>
                    <div className="reward-text-details">
                      <div className="reward-title-row">
                        <strong className="reward-name">{reward.name}</strong>
                        <span className={`status-pill ${reward.is_active && !isExpired ? 'ready' : ''}`}>
                          {!reward.is_active ? t('inactive') : isExpired ? t('expired') : t('active')}
                        </span>
                      </div>
                      <p className="reward-description">
                        {reward.description || t('noDescription')}
                      </p>
                      {reward.expires_at && (
                        <small className={`reward-expiry ${isExpired ? 'is-expired' : ''}`}>
                          {t('expiresAt')}: {new Date(reward.expires_at).toLocaleDateString()}
                        </small>
                      )}
                    </div>
                  </div>

                  <div className="reward-actions-col">
                    <span className="reward-threshold-badge">
                      {threshold} {unit}
                    </span>

                    <div className="reward-button-group">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startEditOffer(reward)}
                        title={t('editOffer')}
                        aria-label={`${t('editOffer')} - ${reward.name}`}
                      >
                        <Edit2 size={15} />
                      </button>

                      <button
                        type="button"
                        className={`icon-button ${reward.is_active ? '' : 'accent-icon'}`}
                        onClick={() => handleToggleActive(reward)}
                        title={reward.is_active ? t('deactivate') : t('activate')}
                        aria-label={`${reward.is_active ? t('deactivate') : t('activate')} - ${reward.name}`}
                      >
                        <Power size={15} />
                      </button>

                      <button
                        type="button"
                        className="icon-button danger-icon"
                        onClick={() => handleDeleteOffer(reward)}
                        title={t('deleteOffer')}
                        aria-label={`${t('deleteOffer')} - ${reward.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
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
            aria-label={t('createOffer')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">{t('createOffer')}</h3>
              <button
                type="button"
                className="icon-button modal-close-btn"
                onClick={() => setShowCreateModal(false)}
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateOffer} className="modal-form">
              <label>
                <span>{t('offerName')}</span>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Free Coffee or 20% Discount"
                />
              </label>

              <label>
                <span>{t('offerDescription')}</span>
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="e.g. Valid for any beverage size"
                />
              </label>

              <label>
                <span>{isPoints ? t('requiredPoints') : t('requiredStamps')}</span>
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
                <span>{t('expiresAt')} <small style={{ color: 'var(--muted)' }}>({t('noExpiration')})</small></span>
                <input
                  type="date"
                  value={createForm.expires_at}
                  onChange={(e) => setCreateForm({ ...createForm, expires_at: e.target.value })}
                />
              </label>

              {createError && <p className="form-error">{createError}</p>}

              <div className="modal-form-actions">
                <button className="secondary-button" type="button" onClick={() => setShowCreateModal(false)}>
                  {t('close')}
                </button>
                <button className="primary-button" type="submit" disabled={creating}>
                  {creating ? t('saving') || 'Saving...' : t('createOffer')}
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
            aria-label={t('editOffer')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">{t('editOffer')}</h3>
              <button
                type="button"
                className="icon-button modal-close-btn"
                onClick={() => setEditingReward(null)}
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateOffer} className="modal-form">
              <label>
                <span>{t('offerName')}</span>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </label>

              <label>
                <span>{t('offerDescription')}</span>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </label>

              <label>
                <span>{isPoints ? t('requiredPoints') : t('requiredStamps')}</span>
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
                <span>{t('expiresAt')}</span>
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
                <span>{t('active')}</span>
              </label>

              {updateError && <p className="form-error">{updateError}</p>}

              <div className="modal-form-actions">
                <button className="secondary-button" type="button" onClick={() => setEditingReward(null)}>
                  {t('close')}
                </button>
                <button className="primary-button" type="submit" disabled={updating}>
                  {updating ? t('saving') || 'Saving...' : t('saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
