import { usePreferences } from '../../contexts/usePreferences'

function buildPath(points, key, maximum) {
  return points.map((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 620
    const y = 190 - (point[key] / maximum) * 155
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function labelForDate(value, language) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(language, { month: 'short', day: '2-digit' })
}

export default function PerformancePanel({ period, onPeriodChange, performance }) {
  const { t, language } = usePreferences()
  const points = performance?.points || []
  const maximum = Math.max(...points.flatMap((point) => [point.newMembers, point.loyaltyIssued]), 1)
  const hasActivity = points.some((point) => point.newMembers > 0 || point.loyaltyIssued > 0)
  const labels = points.filter((_point, index) => index === 0 || index === Math.floor(points.length / 2) || index === points.length - 1)

  return (
    <article className="panel performance-panel">
      <div className="panel-heading">
        <div>
          <h2>{t('programPerformance')}</h2>
          <p>{t('liveActivityDatabase')}</p>
        </div>
        <select value={period} onChange={(event) => onPeriodChange(event.target.value)} aria-label={t('selectPeriod')}>
          <option value="30">{t('last30Days')}</option>
          <option value="90">{t('last90Days')}</option>
          <option value="365">{t('thisYear')}</option>
        </select>
      </div>
      <div className="chart-legend">
        <span><i className="legend-dot coral-dot" /> {t('newMembers')}</span>
        <span><i className="legend-dot blue-dot" /> {t('loyaltyIssued')}</span>
      </div>
      {hasActivity ? (
        <div className="chart">
          <div className="chart-y-axis">
            <span>{maximum}</span>
            <span>{Math.round(maximum * 0.66)}</span>
            <span>{Math.round(maximum * 0.33)}</span>
            <span>0</span>
          </div>
          <div className="chart-area">
            <div className="grid-line line-1" />
            <div className="grid-line line-2" />
            <div className="grid-line line-3" />
            <svg viewBox="0 0 620 210" preserveAspectRatio="none" role="img" aria-label={t('performanceChart')}>
              <path className="chart-line coral-line" d={buildPath(points, 'newMembers', maximum)} />
              <path className="chart-line blue-line" d={buildPath(points, 'loyaltyIssued', maximum)} />
            </svg>
            <div className="chart-x-axis">
              {labels.map((point) => <span key={point.date}>{labelForDate(point.date, language)}</span>)}
            </div>
          </div>
        </div>
      ) : (
        <div className="chart-empty">
          <strong>{t('noActivity')}</strong>
          <span>{t('performanceEmptyCopy')}</span>
        </div>
      )}
    </article>
  )
}
