import { useState } from 'react'
import { CheckCircle2, Coffee, Eye, EyeOff, Lock } from 'lucide-react'
import PreferencesControls from '../PreferencesControls'
import { usePreferences } from '../../contexts/usePreferences'

export default function ResetPasswordScreen({ onUpdatePassword, onCancel }) {
  const { t } = usePreferences()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!password || password.length < 8) {
      setError(t('passwordMinLength', 'Password must be at least 8 characters'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('passwordMismatch', 'Passwords do not match. Please ensure both fields are identical.'))
      return
    }

    setBusy(true)
    const result = await onUpdatePassword(password)
    setBusy(false)

    if (result.error) {
      setError(result.error.message || t('couldNotUpdatePassword', 'Could not update password. Please try again.'))
    } else {
      setSuccess(t('passwordUpdatedSuccess', 'Your password has been updated successfully.'))
      setTimeout(() => {
        // Reload into normal authenticated dashboard state
        window.location.hash = ''
        window.location.reload()
      }, 1500)
    }
  }

  return (
    <main className="auth-page">
      <PreferencesControls />
      <div className="auth-card">
        <div className="brand-row auth-brand">
          <div className="brand-mark">
            <Coffee size={18} strokeWidth={2.5} />
          </div>
          <span>loyaltea</span>
        </div>
        <p className="eyebrow">{t('digitalLoyalty', 'Digital Loyalty Platform')}</p>
        <h1>{t('setNewPassword', 'Set New Password')}</h1>
        <p className="heading-copy">
          {t('setNewPasswordCopy', 'Choose a new secure password of at least 8 characters for your account.')}
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            <span>{t('newPassword', 'New Password')} *</span>
            <div className="password-input-wrap">
              <input
                required
                minLength={8}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={busy || Boolean(success)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password')}
                title={showPassword ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password')}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label>
            <span>{t('confirmNewPassword', 'Confirm New Password')} *</span>
            <div className="password-input-wrap">
              <input
                required
                minLength={8}
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={busy || Boolean(success)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password')}
                title={showConfirmPassword ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password')}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {(error || success) && (
            <p
              className={error ? 'form-error' : 'form-message'}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {success ? <CheckCircle2 size={16} style={{ flexShrink: 0 }} /> : <Lock size={16} style={{ flexShrink: 0 }} />}
              <span>{error || success}</span>
            </p>
          )}

          <button
            className="primary-button auth-submit"
            disabled={busy || Boolean(success)}
            style={{ minHeight: '44px', marginTop: '14px' }}
          >
            {busy ? t('pleaseWait', 'Please wait...') : t('updatePassword', 'Update Password')}
          </button>

          {onCancel && !success && (
            <button
              type="button"
              className="text-button auth-switch"
              onClick={onCancel}
              style={{ marginTop: '16px' }}
            >
              {t('cancel', 'Cancel')}
            </button>
          )}
        </form>
      </div>
    </main>
  )
}
