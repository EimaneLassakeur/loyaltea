import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  Gift,
  RefreshCw,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { usePreferences } from '../../contexts/usePreferences'

export default function ActivityLogSection({
  accessToken,
  businessId = null,
  initialLimit = 2,
  loadBatchSize = 20,
  title,
  subtitle,
  initialExpanded = true,
  variant = 'card', // 'card' | 'panel'
}) {
  const { t, language } = usePreferences()
  const [activities, setActivities] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(() => Boolean(accessToken))
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  const fetchActivities = useCallback(
    async (offset = 0, limit = initialLimit, isAppend = false) => {
      if (!accessToken) return
      if (offset === 0) {
        setLoading(true)
        setError('')
      } else {
        setLoadingMore(true)
      }

      try {
        const query = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        })
        if (businessId) query.set('businessId', businessId)

        const result = await apiFetch(`/api/activity?${query.toString()}`, accessToken)
        const incoming = result?.activities || []
        setActivities((prev) => (isAppend ? [...prev, ...incoming] : incoming))
        setHasMore(Boolean(result?.hasMore))
        setTotal(Number(result?.total) || 0)
      } catch (err) {
        setError(err.message || t('couldNotLoadActivity', 'Could not load activity log'))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [accessToken, businessId, initialLimit, t]
  )

  useEffect(() => {
    let active = true
    if (!accessToken) return undefined

    const query = new URLSearchParams({
      limit: String(initialLimit),
      offset: '0',
    })
    if (businessId) query.set('businessId', businessId)

    apiFetch(`/api/activity?${query.toString()}`, accessToken)
      .then((result) => {
        if (!active) return
        setActivities(result?.activities || [])
        setHasMore(Boolean(result?.hasMore))
        setTotal(Number(result?.total) || 0)
      })
      .catch((err) => {
        if (active) setError(err.message || t('couldNotLoadActivity', 'Could not load activity log'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [accessToken, businessId, initialLimit, t])

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return
    fetchActivities(activities.length, loadBatchSize, true)
  }

  const formatActivityDate = (isoString) => {
    if (!isoString) return ''
    try {
      const date = new Date(isoString)
      return date.toLocaleDateString(language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  const sectionTitle = title || t('recentActivity', 'Recent Activity')
  const sectionSubtitle = subtitle || t('latestMemberUpdates', 'Recent transactions & loyalty movements')

  return (
    <section className={`activity-log-container ${variant === 'panel' ? 'panel' : 'panel activity-panel'}`}>
      <div
        className="activity-log-header"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded(!isExpanded)
          }
        }}
        aria-expanded={isExpanded}
        aria-label={sectionTitle}
      >
        <div className="activity-header-info">
          <div className="activity-header-title-row">
            <h2 className="activity-title">{sectionTitle}</h2>
            {total > 0 && <span className="activity-count-badge">{total}</span>}
          </div>
          <p className="activity-subtitle">{sectionSubtitle}</p>
        </div>
        <div className="activity-header-controls">
          <button
            type="button"
            className="icon-button activity-refresh-btn"
            onClick={(e) => {
              e.stopPropagation()
              fetchActivities(0, initialLimit, false)
            }}
            title={t('refresh', 'Refresh')}
            aria-label={t('refresh', 'Refresh')}
          >
            <RefreshCw size={15} className={loading ? 'spin-animation' : ''} />
          </button>
          <span className="activity-toggle-icon" aria-hidden="true">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="activity-log-body">
          {error && (
            <div className="activity-error-banner" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => fetchActivities(0, initialLimit, false)}
              >
                {t('tryAgain', 'Try again')}
              </button>
            </div>
          )}

          {loading && activities.length === 0 ? (
            <div className="activity-loading-state">
              <Clock size={20} className="spin-animation" />
              <span>{t('loadingActivity', 'Loading activity...')}</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="panel-empty activity-empty">
              <Coffee size={24} />
              <strong>{t('noActivity', 'No activity recorded yet')}</strong>
              <span>{t('activityWillAppear', 'Loyalty scans and redemptions will appear here in chronological order.')}</span>
            </div>
          ) : (
            <div className="activity-entries-list">
              {activities.map((item) => {
                const isEarn = item.type === 'EARN'
                const delta = item.stamps_delta !== 0 ? item.stamps_delta : item.points_delta
                const unit = item.stamps_delta !== 0 ? t('stamps', 'stamps') : t('points', 'points')
                const isPositive = delta > 0

                let rewardName = null
                if (item.metadata) {
                  try {
                    const parsed = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata
                    rewardName = parsed?.reward_name || null
                  } catch {
                    // Ignore parse error
                  }
                }

                return (
                  <article className="activity-entry-row" key={item.id}>
                    <div className={`activity-icon-bubble ${isEarn ? 'is-earn' : 'is-redeem'}`} aria-hidden="true">
                      {isEarn ? <ArrowDownLeft size={16} /> : <Gift size={16} />}
                    </div>

                    <div className="activity-entry-details">
                      <div className="activity-entry-main">
                        <strong className="activity-entry-title">
                          {isEarn ? t('loyaltyEarned', 'Points Earned') : t('rewardRedeemed', 'Reward Redeemed')}
                        </strong>
                        {rewardName && (
                          <span className="activity-reward-tag">
                            {rewardName}
                          </span>
                        )}
                      </div>

                      <div className="activity-entry-meta">
                        {item.customer_name && (
                          <span className="activity-user-badge">
                            {item.customer_name}
                          </span>
                        )}
                        {item.business_name && (
                          <span className="activity-business-badge">
                            {item.business_name}
                          </span>
                        )}
                        <time className="activity-time-stamp" dateTime={item.created_at}>
                          {formatActivityDate(item.created_at)}
                        </time>
                      </div>
                    </div>

                    <div className="activity-entry-delta-col">
                      <span className={`activity-delta-value ${isPositive ? 'delta-positive' : 'delta-negative'}`}>
                        {isPositive ? `+${delta}` : delta}
                      </span>
                      <small className="activity-delta-unit">{unit}</small>
                    </div>
                  </article>
                )
              })}

              {hasMore && (
                <div className="activity-load-more-row">
                  <button
                    type="button"
                    className="secondary-button activity-load-more-btn"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <RefreshCw size={14} className="spin-animation" />
                        <span>{t('loading', 'Loading...')}</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight size={14} />
                        <span>
                          {t('loadNextEntries', 'Load Next 20 Entries')} ({total - activities.length} {t('remaining', 'remaining')})
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
