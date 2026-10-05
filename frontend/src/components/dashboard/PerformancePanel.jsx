function buildPath(points, key, maximum) {
  return points.map((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 620
    const y = 190 - (point[key] / maximum) * 155
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function labelForDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

export default function PerformancePanel({ period, onPeriodChange, performance }) {
  const points = performance?.points || []
  const maximum = Math.max(...points.flatMap((point) => [point.newMembers, point.loyaltyIssued]), 1)
  const hasActivity = points.some((point) => point.newMembers > 0 || point.loyaltyIssued > 0)
  const labels = points.filter((_point, index) => index === 0 || index === Math.floor(points.length / 2) || index === points.length - 1)

  return <article className="panel performance-panel"><div className="panel-heading"><div><h2>Program performance</h2><p>Live activity from your database</p></div><select value={period} onChange={(event) => onPeriodChange(event.target.value)} aria-label="Select time period"><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">This year</option></select></div><div className="chart-legend"><span><i className="legend-dot coral-dot" /> New members</span><span><i className="legend-dot blue-dot" /> Loyalty issued</span></div>{hasActivity ? <div className="chart"><div className="chart-y-axis"><span>{maximum}</span><span>{Math.round(maximum * .66)}</span><span>{Math.round(maximum * .33)}</span><span>0</span></div><div className="chart-area"><div className="grid-line line-1" /><div className="grid-line line-2" /><div className="grid-line line-3" /><svg viewBox="0 0 620 210" preserveAspectRatio="none" role="img" aria-label="Program performance chart"><path className="chart-line coral-line" d={buildPath(points, 'newMembers', maximum)} /><path className="chart-line blue-line" d={buildPath(points, 'loyaltyIssued', maximum)} /></svg><div className="chart-x-axis">{labels.map((point) => <span key={point.date}>{labelForDate(point.date)}</span>)}</div></div></div> : <div className="chart-empty"><strong>No activity yet</strong><span>New members and loyalty activity will appear here.</span></div>}</article>
}
