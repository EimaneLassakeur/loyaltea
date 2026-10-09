import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg

export const pool = new Pool({
  connectionString: config.databaseConnectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: config.databaseSsl,
})

export async function checkDatabaseConnection() {
  const result = await pool.query('select 1 as ok')
  return result.rows[0]?.ok === 1
}

pool.on('error', (error) => {
  console.error(JSON.stringify({ event: 'database_pool_error', category: 'database_connection', name: error.name, message: error.message }))
})

export async function getAccessibleBusinessIds(userId) {
  const roleResult = await pool.query('select role from public.users where id = $1', [userId])
  if (roleResult.rows[0]?.role === 'PLATFORM_ADMIN') {
    const allBusinesses = await pool.query('select id from public.businesses')
    return allBusinesses.rows.map((row) => row.id)
  }
  const result = await pool.query(`
    select id from public.businesses where owner_user_id = $1
    union
    select business_id from public.employees where user_id = $1 and is_active
  `, [userId])
  return result.rows.map((row) => row.id || row.business_id)
}

export async function getBusinessStats(businessId) {
  const result = await pool.query(`
    select
      (select count(*)::int from public.customer_memberships m join public.loyalty_programs p on p.id = m.program_id where p.business_id = $1) as customers,
      (select coalesce(sum(abs(t.stamps_delta) + abs(t.points_delta)), 0)::int from public.transactions t where t.business_id = $1 and t.type = 'EARN') as issued,
      (select count(*)::int from public.reward_redemptions r where r.business_id = $1) as redeemed,
      (select coalesce(round(100.0 * count(*) filter (where m.is_active) / nullif(count(*), 0), 1), 0) from public.customer_memberships m join public.loyalty_programs p on p.id = m.program_id where p.business_id = $1) as active_rate
  `, [businessId])
  const row = result.rows[0]
  return { customers: row.customers, issued: row.issued, redeemed: row.redeemed, activeRate: Number(row.active_rate) }
}

export async function getBusinessPerformance(businessId, days = 30) {
  const safeDays = [30, 90, 365].includes(Number(days)) ? Number(days) : 30
  const result = await pool.query(`
    with days as (
      select generate_series(current_date - ($2::int - 1), current_date, interval '1 day')::date as day
    )
    select
      d.day,
      (select count(*)::int from public.customer_memberships m join public.loyalty_programs p on p.id = m.program_id where p.business_id = $1 and m.joined_at >= d.day and m.joined_at < d.day + interval '1 day') as new_members,
      (select coalesce(sum(abs(t.stamps_delta) + abs(t.points_delta)), 0)::int from public.transactions t where t.business_id = $1 and t.type = 'EARN' and t.created_at >= d.day and t.created_at < d.day + interval '1 day') as loyalty_issued
    from days d
    order by d.day
  `, [businessId, safeDays])
  return result.rows.map((row) => ({ date: row.day, newMembers: row.new_members, loyaltyIssued: row.loyalty_issued }))
}

export async function getPlatformOverview() {
  const result = await pool.query(`
    select b.id, b.name, b.slug, b.created_at,
      (select count(*)::int from public.loyalty_programs p where p.business_id = b.id and p.is_active) as active_programs,
      (select count(*)::int from public.customer_memberships m join public.loyalty_programs p on p.id = m.program_id where p.business_id = b.id) as customers,
      (select count(*)::int from public.transactions t where t.business_id = b.id) as transactions,
      (select count(*)::int from public.reward_redemptions r where r.business_id = b.id) as redemptions
    from public.businesses b order by b.created_at desc
  `)
  const businesses = result.rows
  return {
    businesses,
    totals: {
      businesses: businesses.length,
      activePrograms: businesses.reduce((sum, business) => sum + business.active_programs, 0),
      customers: businesses.reduce((sum, business) => sum + business.customers, 0),
      transactions: businesses.reduce((sum, business) => sum + business.transactions, 0),
    },
  }
}

export async function createWorkspace({ userId, businessName, slug, locationName, address, programName, model, pointsPerCurrency, currencyUnit, rewardName, rewardDescription, threshold }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const businessResult = await client.query(
      `insert into public.businesses (owner_user_id, name, slug) values ($1, $2, $3) returning *`,
      [userId, businessName, slug],
    )
    const business = businessResult.rows[0]
    const locationResult = await client.query(
      `insert into public.business_locations (business_id, name, address, is_active) values ($1, $2, $3, true) returning *`,
      [business.id, locationName, address || null],
    )
    const programResult = await client.query(
      `insert into public.loyalty_programs (business_id, name, model, points_per_currency, currency_unit, is_active) values ($1, $2, $3, $4, $5, true) returning *`,
      [business.id, programName, model, model === 'POINTS' ? pointsPerCurrency : null, currencyUnit || 'DZD'],
    )
    const rewardResult = await client.query(
      `insert into public.rewards (program_id, name, description, required_stamps, required_points, is_active) values ($1, $2, $3, $4, $5, true) returning *`,
      [programResult.rows[0].id, rewardName, rewardDescription || null, model === 'STAMPS' ? threshold : null, model === 'POINTS' ? threshold : null],
    )
    await client.query('commit')
    return { business, location: locationResult.rows[0], program: programResult.rows[0], reward: rewardResult.rows[0] }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function createEmployee({ userId, businessId, role, permissions, locationIds = [] }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const userResult = await client.query('select id, role from public.users where id = $1 for update', [userId])
    if (!userResult.rows[0]) throw httpError(404, 'Employee user was not found')
    if (['PLATFORM_ADMIN', 'BUSINESS_OWNER'].includes(userResult.rows[0].role)) throw httpError(403, 'Platform administrators and business owners cannot be reassigned as employees')
    const locationResult = await client.query('select id from public.business_locations where business_id = $1 and id = any($2::uuid[]) and is_active', [businessId, locationIds])
    if (locationResult.rowCount !== locationIds.length) throw httpError(400, 'One or more employee locations are invalid or inactive')
    await client.query('update public.users set role = $2, updated_at = now() where id = $1', [userId, role])
    const employeeResult = await client.query(
      `insert into public.employees (user_id, business_id, role, permissions, is_active) values ($1, $2, $3, $4, true) returning *`,
      [userId, businessId, role, JSON.stringify(permissions || { earn: true, redeem: true, view_customers: true })],
    )
    for (const locationId of locationIds) await client.query('insert into public.employee_locations (employee_id, location_id) values ($1, $2)', [employeeResult.rows[0].id, locationId])
    await client.query('commit')
    return employeeResult.rows[0]
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function earnLoyalty({ userId, membershipId, locationId, model, amount, requestId }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const membershipResult = await client.query(`
      select m.*, p.business_id, p.model, p.points_per_currency, p.is_active as program_active
      from public.customer_memberships m
      join public.loyalty_programs p on p.id = m.program_id
      where m.id = $1
      for update
    `, [membershipId])
    const membership = membershipResult.rows[0]
    if (!membership || !membership.is_active) throw httpError(404, 'Membership is not active')
    if (!membership.program_active) throw httpError(400, 'Loyalty program is inactive')
    if (membership.model !== model) throw httpError(400, 'Loyalty model does not match the program')
    if (!['STAMPS', 'POINTS'].includes(model)) throw httpError(400, 'Invalid loyalty model')

    await assertStaffCanOperate(client, userId, membership.business_id, locationId, 'earn')
    const employeeResult = await client.query(
      'select id from public.employees where user_id = $1 and business_id = $2 and is_active limit 1',
      [userId, membership.business_id],
    )
    const employeeId = employeeResult.rows[0]?.id || null
    const normalizedAmount = Number(amount)
    if (model === 'POINTS' && (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 1_000_000)) throw httpError(400, 'Purchase amount is invalid')
    const stampsDelta = model === 'STAMPS' ? 1 : 0
    const pointsDelta = model === 'POINTS' ? Math.floor(normalizedAmount * Number(membership.points_per_currency)) : 0
    if (model === 'POINTS' && pointsDelta < 1) throw httpError(400, 'Purchase amount is below the minimum points threshold')
    const transactionResult = await client.query(`
      insert into public.transactions
        (membership_id, business_id, location_id, employee_id, type, stamps_delta, points_delta, idempotency_key)
      values ($1, $2, $3, $4, 'EARN', $5, $6, $7)
      on conflict (idempotency_key) do nothing
      returning *
    `, [membershipId, membership.business_id, locationId, employeeId, stampsDelta, pointsDelta, requestId])

    if (transactionResult.rowCount === 0) {
      const existing = await client.query('select * from public.transactions where idempotency_key = $1', [requestId])
      const row = existing.rows[0]
      if (!row || row.membership_id !== membershipId || row.business_id !== membership.business_id || row.stamps_delta !== stampsDelta || row.points_delta !== pointsDelta) {
        throw httpError(409, 'Request id was already used for another transaction')
      }
      await client.query('commit')
      return row
    }

    await client.query(`
      update public.customer_memberships
      set stamps_balance = stamps_balance + $2,
          points_balance = points_balance + $3,
          updated_at = now()
      where id = $1
    `, [membershipId, stampsDelta, pointsDelta])
    await client.query('commit')
    return transactionResult.rows[0]
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function redeemReward({ userId, membershipId, rewardId, locationId, requestId }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const membershipResult = await client.query(`
      select m.*, p.business_id, p.model, p.is_active as program_active
      from public.customer_memberships m
      join public.loyalty_programs p on p.id = m.program_id
      where m.id = $1
      for update
    `, [membershipId])
    const membership = membershipResult.rows[0]
    if (!membership || !membership.is_active) throw httpError(404, 'Membership is not active')

    const rewardResult = await client.query(`
      select r.*, p.business_id, p.model, p.is_active as program_active
      from public.rewards r
      join public.loyalty_programs p on p.id = r.program_id
      where r.id = $1
    `, [rewardId])
    const reward = rewardResult.rows[0]
    if (!reward || !reward.is_active || !reward.program_active || reward.program_id !== membership.program_id || (reward.expires_at && new Date(reward.expires_at) <= new Date())) {
      throw httpError(400, 'Reward is not available for this membership')
    }
    await assertStaffCanOperate(client, userId, reward.business_id, locationId, 'redeem')

    const stampsCost = reward.required_stamps || 0
    const pointsCost = reward.required_points || 0
    if (membership.stamps_balance < stampsCost || membership.points_balance < pointsCost) throw httpError(400, 'Reward is not eligible')

    const employeeResult = await client.query(
      'select id from public.employees where user_id = $1 and business_id = $2 and is_active limit 1',
      [userId, reward.business_id],
    )
    const employeeId = employeeResult.rows[0]?.id || null
    const redemptionResult = await client.query(`
      insert into public.reward_redemptions
        (membership_id, business_id, location_id, employee_id, reward_id, idempotency_key)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (idempotency_key) do nothing
      returning *
    `, [membershipId, reward.business_id, locationId, employeeId, rewardId, requestId])

    if (redemptionResult.rowCount === 0) {
      const existing = await client.query('select * from public.reward_redemptions where idempotency_key = $1', [requestId])
      const row = existing.rows[0]
      if (!row || row.membership_id !== membershipId || row.business_id !== reward.business_id || row.reward_id !== rewardId) throw httpError(409, 'Request id was already used for another redemption')
      await client.query('commit')
      return row
    }

    await client.query(`
      update public.customer_memberships
      set stamps_balance = stamps_balance - $2,
          points_balance = points_balance - $3,
          updated_at = now()
      where id = $1
    `, [membershipId, stampsCost, pointsCost])
    await client.query(`
      insert into public.transactions
        (membership_id, business_id, location_id, employee_id, type, stamps_delta, points_delta, idempotency_key, metadata)
      values ($1, $2, $3, $4, 'REDEEM', $5, $6, $7, $8)
    `, [membershipId, reward.business_id, locationId, employeeId, -stampsCost, -pointsCost, requestId, JSON.stringify({ reward_id: rewardId })])
    await client.query('commit')
    return redemptionResult.rows[0]
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function assertStaffCanOperate(client, userId, businessId, locationId, permission) {
  const locationResult = await client.query(
    'select id from public.business_locations where id = $1 and business_id = $2 and is_active',
    [locationId, businessId],
  )
  if (locationResult.rowCount === 0) throw httpError(400, 'Location is invalid or inactive')

  const employeeResult = await client.query(`
    select e.id, e.role, e.permissions
    from public.employees e
    where e.user_id = $1 and e.business_id = $2 and e.is_active
      and (e.role = 'MANAGER' or exists (
        select 1 from public.employee_locations el
        where el.employee_id = e.id and el.location_id = $3
      ))
  `, [userId, businessId, locationId])
  const ownerResult = await client.query('select 1 from public.businesses where id = $1 and owner_user_id = $2', [businessId, userId])
  const adminResult = await client.query("select 1 from public.users where id = $1 and role = 'PLATFORM_ADMIN'", [userId])
  if (employeeResult.rowCount === 0 && ownerResult.rowCount === 0 && adminResult.rowCount === 0) throw httpError(403, 'Location access denied')
  if (employeeResult.rows.some((employee) => employee.permissions?.[permission] === false)) throw httpError(403, `${permission} permission denied`)
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
