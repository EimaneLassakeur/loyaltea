import { pool } from './database.js'

export async function getBusinessSubscription(businessId) {
  const result = await pool.query(`
    select s.id, s.business_id, s.plan_id, s.starts_at, s.ends_at, s.status,
           p.name as plan_name, p.description as plan_description, p.price, p.currency, p.duration_days
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.business_id = $1
    order by s.created_at desc
    limit 1
  `, [businessId])
  return result.rows[0] || null
}

export function subscriptionAllowsAccess(subscription, now = new Date()) {
  if (!subscription) return false
  const end = new Date(subscription.ends_at)
  const start = new Date(subscription.starts_at)
  return subscription.status === 'active' && start <= now && end > now
}

export async function requireActiveBusinessSubscription(request, response, next) {
  try {
    if (request.profile?.role === 'PLATFORM_ADMIN') return next()
    const businessIds = request.businessIds || []
    if (!businessIds.length) return next()
    const result = await pool.query(`
      select distinct on (b.id) b.id, b.status as business_status, s.status, s.starts_at, s.ends_at
      from public.businesses b
      left join public.subscriptions s on s.business_id = b.id
      where b.id = any($1::uuid[])
      order by b.id, s.created_at desc nulls last
    `, [businessIds])
    const activeBusinessIds = result.rows.filter((row) => row.business_status === 'active' && subscriptionAllowsAccess(row)).map((row) => row.id)
    request.subscriptionRows = result.rows
    request.activeBusinessIds = activeBusinessIds
    if (!activeBusinessIds.length) return response.status(402).json({ error: 'An active subscription is required to access this workspace', code: 'SUBSCRIPTION_REQUIRED' })
    return next()
  } catch (error) {
    return next(error)
  }
}

export async function expireSubscriptions() {
  const result = await pool.query(`
    update public.subscriptions
    set status = 'expired', updated_at = now()
    where status in ('pending', 'active', 'past_due') and ends_at <= now()
    returning id, business_id
  `)
  return result.rows
}

export async function recordCashPaymentAndRenew({ businessId, planId, amount, currency, startsAt, receivedAt, reference, notes, actorUserId, idempotencyKey }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const existing = await client.query('select * from public.subscription_payments where idempotency_key = $1', [idempotencyKey])
    if (existing.rowCount) { await client.query('commit'); return { payment: existing.rows[0], replayed: true } }
    const planResult = await client.query('select id, price, currency, duration_days from public.subscription_plans where id = $1 and is_active', [planId])
    const plan = planResult.rows[0]
    if (!plan) throw httpError(404, 'Subscription plan was not found or is inactive')
    const businessResult = await client.query('select id from public.businesses where id = $1', [businessId])
    if (!businessResult.rowCount) throw httpError(404, 'Business was not found')
    const start = startsAt ? new Date(startsAt) : new Date()
    const paymentDate = receivedAt ? new Date(receivedAt) : new Date()
    if (Number.isNaN(start.getTime()) || Number.isNaN(paymentDate.getTime())) throw httpError(400, 'Payment or start date is invalid')
    const end = new Date(start.getTime() + plan.duration_days * 86400000)
    await client.query("update public.subscriptions set status = 'expired', updated_by = $2, updated_at = now() where business_id = $1 and status in ('pending', 'active', 'past_due', 'suspended')", [businessId, actorUserId])
    const subscriptionResult = await client.query(`insert into public.subscriptions (business_id, plan_id, starts_at, ends_at, status, created_by, updated_by) values ($1, $2, $3, $4, 'active', $5, $5) returning *`, [businessId, planId, start, end, actorUserId])
    const paymentResult = await client.query(`insert into public.subscription_payments (subscription_id, business_id, amount, currency, received_at, method, reference, notes, recorded_by, idempotency_key) values ($1, $2, $3, $4, $5, 'CASH', $6, $7, $8, $9) returning *`, [subscriptionResult.rows[0].id, businessId, amount, currency || plan.currency, paymentDate, reference || null, notes || null, actorUserId, idempotencyKey])
    await client.query(`insert into public.audit_logs (actor_user_id, business_id, action, target_type, target_id, metadata) values ($1, $2, 'subscription.renewed.cash', 'subscription', $3, $4)`, [actorUserId, businessId, subscriptionResult.rows[0].id, JSON.stringify({ payment_id: paymentResult.rows[0].id, plan_id: planId })])
    await client.query('commit')
    return { subscription: subscriptionResult.rows[0], payment: paymentResult.rows[0], replayed: false }
  } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
}

function httpError(status, message) { const error = new Error(message); error.status = status; return error }
