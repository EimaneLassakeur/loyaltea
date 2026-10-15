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
    const allBusinesses = await pool.query('select id from public.businesses where archived_at is null')
    return allBusinesses.rows.map((row) => row.id)
  }
  const result = await pool.query(`
    select id from public.businesses where owner_user_id = $1 and archived_at is null
    union
    select e.business_id from public.employees e
    join public.businesses b on b.id = e.business_id
    where e.user_id = $1 and e.is_active and b.archived_at is null
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

export async function getPendingBusinessSubscription(userId) {
  const result = await pool.query(`
    select s.id, s.business_id, s.plan_id, s.starts_at, s.ends_at, s.status,
           b.name as business_name, p.name as plan_name, p.price, p.currency, p.duration_days
    from public.subscriptions s
    join public.businesses b on b.id = s.business_id
    join public.subscription_plans p on p.id = s.plan_id
    where b.owner_user_id = $1 and b.archived_at is null
    order by s.created_at desc
    limit 1
  `, [userId])
  return result.rows[0] || null
}

export async function getSubscriptionPlans(includeInactive = false) {
  const result = await pool.query(`select id, name, description, price, currency, duration_days, features, is_active from public.subscription_plans ${includeInactive ? '' : 'where is_active'} order by price, name`)
  return result.rows
}

export async function createBusinessProvisioning({ adminUserId, businessName, slug, ownerEmail, ownerPhone, ownerFullName, ownerPassword, planId }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const ownerResult = await client.query('select id from public.users where ($1::text is not null and phone = $1) limit 1', [ownerPhone || null])
    if (ownerResult.rowCount) throw httpError(409, 'An owner account with that phone already exists')
    const planResult = await client.query('select id, name, price, currency, duration_days from public.subscription_plans where id = $1 and is_active', [planId])
    if (!planResult.rowCount) throw httpError(404, 'Subscription plan was not found or is inactive')
    const existingSlug = await client.query('select 1 from public.businesses where slug = $1', [slug])
    if (existingSlug.rowCount) throw httpError(409, 'This business slug is already in use')
    await client.query('commit')
    const fallbackEmail = ownerEmail || (ownerPhone ? `phone_${ownerPhone.replace(/\D/g, '')}@loyaltea.local` : undefined)
    return {
      identity: {
        email: fallbackEmail,
        phone: ownerPhone || undefined,
        password: ownerPassword,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { full_name: ownerFullName, role: 'BUSINESS_OWNER' },
        app_metadata: { role: 'BUSINESS_OWNER' },
      },
      plan: planResult.rows[0],
      adminUserId,
      businessName,
      slug,
    }
  } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
}

export async function finishBusinessProvisioning({ ownerUserId, adminUserId, businessName, slug, planId }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query("update public.users set role = 'BUSINESS_OWNER' where id = $1", [ownerUserId])
    await client.query("delete from public.customers where id = $1", [ownerUserId])
    const userResult = await client.query("select id from public.users where id = $1 and role = 'BUSINESS_OWNER' for update", [ownerUserId])
    if (!userResult.rowCount) throw httpError(400, 'Owner profile was not created correctly')
    const existingBusiness = await client.query('select id from public.businesses where owner_user_id = $1', [ownerUserId])
    if (existingBusiness.rowCount) throw httpError(409, 'This owner already has a business')
    const businessResult = await client.query('insert into public.businesses (owner_user_id, name, slug) values ($1, $2, $3) returning id, name, slug, owner_user_id, created_at', [ownerUserId, businessName, slug])
    const subscriptionResult = await client.query(`insert into public.subscriptions (business_id, plan_id, starts_at, ends_at, status, created_by, updated_by) select $1, id, now(), now() + make_interval(days => duration_days), 'pending', $2, $2 from public.subscription_plans where id = $3 and is_active returning id, business_id, plan_id, starts_at, ends_at, status`, [businessResult.rows[0].id, adminUserId, planId])
    if (!subscriptionResult.rowCount) throw httpError(404, 'Subscription plan was not found or is inactive')
    await client.query('insert into public.business_locations (business_id, name, is_active) values ($1, $2, true)', [businessResult.rows[0].id, `${businessName} Main`])
    const programResult = await client.query('insert into public.loyalty_programs (business_id, name, model, is_active) values ($1, $2, $3, true) returning id', [businessResult.rows[0].id, `${businessName} Program`, 'STAMPS'])
    await client.query('insert into public.rewards (program_id, name, description, required_stamps, is_active) values ($1, $2, $3, 10, true)', [programResult.rows[0].id, 'Free Reward', 'Claim 1 free reward after 10 stamps'])
    await client.query(`insert into public.audit_logs (actor_user_id, business_id, action, target_type, target_id, metadata) values ($1, $2, 'business.created', 'business', $2, $3)`, [adminUserId, businessResult.rows[0].id, JSON.stringify({ owner_user_id: ownerUserId, subscription_id: subscriptionResult.rows[0].id, plan_id: planId })])
    await client.query('commit')
    return { business: businessResult.rows[0], subscription: subscriptionResult.rows[0] }
  } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
}

export async function updateBusinessLifecycle({ businessId, status, actorUserId }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const businessResult = await client.query('select id, name, status from public.businesses where id = $1 for update', [businessId])
    if (!businessResult.rowCount) throw httpError(404, 'Business was not found')
    if (status === 'paused' || status === 'suspended') await client.query("update public.subscriptions set status = 'suspended', updated_by = $2, updated_at = now() where business_id = $1 and status in ('pending', 'active', 'past_due')", [businessId, actorUserId])
    if (status === 'active') await client.query("update public.subscriptions set status = 'active', updated_by = $2, updated_at = now() where business_id = $1 and status = 'suspended' and ends_at > now()", [businessId, actorUserId])
    const result = await client.query('update public.businesses set status = $2, updated_at = now() where id = $1 returning id, name, slug, status', [businessId, status])
    await client.query(`insert into public.audit_logs (actor_user_id, business_id, action, target_type, target_id, metadata) values ($1, $2, $3, 'business', $2, $4)`, [actorUserId, businessId, `business.${status}`, JSON.stringify({ previous_status: businessResult.rows[0].status, next_status: status })])
    await client.query('commit')
    return result.rows[0]
  } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
}

export async function deleteOrArchiveBusiness({ businessId, actorUserId, mode = 'auto' }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const businessResult = await client.query(
      'select id, name, slug, status, owner_user_id, archived_at from public.businesses where id = $1 for update',
      [businessId]
    )
    if (!businessResult.rowCount) throw httpError(404, 'Business was not found')
    const business = businessResult.rows[0]

    // Inspect dependent financial & audit records
    const depRes = await client.query(`
      select
        (select count(*)::int from public.subscription_payments where business_id = $1) as payments,
        (select count(*)::int from public.transactions where business_id = $1) as transactions,
        (select count(*)::int from public.reward_redemptions where business_id = $1) as redemptions
    `, [businessId])
    const { payments, transactions, redemptions } = depRes.rows[0]
    const hasFinancialHistory = payments > 0 || transactions > 0 || redemptions > 0

    if (mode === 'permanent' && hasFinancialHistory) {
      throw httpError(
        409,
        `Cannot permanently delete business "${business.name}" because it contains ${payments} payment(s), ${transactions} transaction(s), and ${redemptions} redemption(s). Archiving was applied instead to preserve financial and audit records.`
      )
    }

    if (hasFinancialHistory || mode === 'archive') {
      // Soft-delete / archive: Suspend business, cancel subscriptions, deactivate programs & memberships
      await client.query(
        "update public.businesses set status = 'suspended', archived_at = now(), updated_at = now() where id = $1",
        [businessId]
      )
      await client.query(
        "update public.subscriptions set status = 'cancelled', updated_by = $2, updated_at = now() where business_id = $1 and status in ('pending', 'active', 'past_due', 'suspended')",
        [businessId, actorUserId]
      )
      await client.query(
        "update public.loyalty_programs set is_active = false, updated_at = now() where business_id = $1",
        [businessId]
      )
      await client.query(
        `update public.customer_memberships cm
         set is_active = false, updated_at = now()
         from public.loyalty_programs lp
         where cm.program_id = lp.id and lp.business_id = $1`,
        [businessId]
      )

      // Demote owner if they don't own any other active business and are not an admin
      if (business.owner_user_id) {
        const otherBiz = await client.query(
          'select id from public.businesses where owner_user_id = $1 and id != $2 and archived_at is null limit 1',
          [business.owner_user_id, businessId]
        )
        if (!otherBiz.rowCount) {
          const userRole = await client.query('select role from public.users where id = $1', [business.owner_user_id])
          if (userRole.rows[0]?.role === 'BUSINESS_OWNER') {
            await client.query("update public.users set role = 'CUSTOMER', updated_at = now() where id = $1", [business.owner_user_id])
            await client.query('insert into public.customers (id) values ($1) on conflict (id) do nothing', [business.owner_user_id])
          }
        }
      }

      await client.query(
        `insert into public.audit_logs (actor_user_id, business_id, action, target_type, target_id, metadata)
         values ($1, $2, 'business.archived', 'business', $2, $3)`,
        [actorUserId, businessId, JSON.stringify({ previous_status: business.status, payments, transactions, redemptions })]
      )

      await client.query('commit')
      return {
        id: businessId,
        action: 'archived',
        name: business.name,
        archived: true,
        permanent: false,
        message: hasFinancialHistory
          ? `Business "${business.name}" was safely archived. Financial records (${payments} payment(s), ${transactions} transaction(s)) were preserved.`
          : `Business "${business.name}" was archived.`,
      }
    }

    // Clean permanent deletion for businesses with 0 payments, 0 transactions, 0 redemptions
    await client.query('delete from public.subscriptions where business_id = $1', [businessId])
    await client.query('delete from public.business_locations where business_id = $1', [businessId])
    await client.query('delete from public.loyalty_programs where business_id = $1', [businessId])
    await client.query('delete from public.employees where business_id = $1', [businessId])
    await client.query('delete from public.customer_events where business_id = $1', [businessId])
    await client.query('delete from public.businesses where id = $1', [businessId])

    // Demote owner if they don't own any other active business and are not an admin
    if (business.owner_user_id) {
      const otherBiz = await client.query(
        'select id from public.businesses where owner_user_id = $1 limit 1',
        [business.owner_user_id]
      )
      if (!otherBiz.rowCount) {
        const userRole = await client.query('select role from public.users where id = $1', [business.owner_user_id])
        if (userRole.rows[0]?.role === 'BUSINESS_OWNER') {
          await client.query("update public.users set role = 'CUSTOMER', updated_at = now() where id = $1", [business.owner_user_id])
          await client.query('insert into public.customers (id) values ($1) on conflict (id) do nothing', [business.owner_user_id])
        }
      }
    }

    await client.query(
      `insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
       values ($1, 'business.deleted', 'business', $2, $3)`,
      [actorUserId, businessId, JSON.stringify({ name: business.name, slug: business.slug })]
    )

    await client.query('commit')
    return {
      id: businessId,
      action: 'deleted',
      name: business.name,
      deleted: true,
      permanent: true,
      message: `Business "${business.name}" was permanently deleted.`,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const archiveBusiness = deleteOrArchiveBusiness

export async function createSubscriptionPlan({ actorUserId, name, description, price, currency, durationDays, features }) {
  const result = await pool.query('insert into public.subscription_plans (name, description, price, currency, duration_days, features) values ($1, $2, $3, $4, $5, $6) returning *', [name, description || null, price, currency || 'DZD', durationDays, JSON.stringify(features || {})])
  await pool.query(`insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata) values ($1, 'subscription_plan.created', 'subscription_plan', $2, $3)`, [actorUserId, result.rows[0].id, JSON.stringify({ name, price, duration_days: durationDays })])
  return result.rows[0]
}

export async function updateSubscriptionPlan({ actorUserId, planId, name, description, price, currency, durationDays, features, isActive }) {
  const result = await pool.query('update public.subscription_plans set name = $2, description = $3, price = $4, currency = $5, duration_days = $6, features = $7, is_active = $8, updated_at = now() where id = $1 returning *', [planId, name, description || null, price, currency || 'DZD', durationDays, JSON.stringify(features || {}), isActive])
  if (!result.rowCount) throw httpError(404, 'Subscription plan was not found')
  await pool.query(`insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata) values ($1, 'subscription_plan.updated', 'subscription_plan', $2, $3)`, [actorUserId, planId, JSON.stringify({ is_active: isActive })])
  return result.rows[0]
}

export async function getPlatformOverview() {
  const [activeResult, archivedResult] = await Promise.all([
    pool.query(`
      select b.id, b.name, b.slug, b.status, b.created_at, b.owner_user_id,
        u.full_name as owner_name, u.phone as owner_phone,
        au.email as owner_email,
        (select address from public.business_locations bl where bl.business_id = b.id and bl.is_active order by bl.created_at asc limit 1) as address,
        (select count(*)::int from public.loyalty_programs p where p.business_id = b.id and p.is_active) as active_programs,
        (select count(*)::int from public.customer_memberships m join public.loyalty_programs p on p.id = m.program_id where p.business_id = b.id) as customers,
        (select count(*)::int from public.transactions t where t.business_id = b.id) as transactions,
        (select count(*)::int from public.reward_redemptions r where r.business_id = b.id) as redemptions
      from public.businesses b
      left join public.users u on u.id = b.owner_user_id
      left join auth.users au on au.id = b.owner_user_id
      where b.archived_at is null
      order by b.created_at desc
    `),
    pool.query(`
      select b.id, b.name, b.slug, b.status, b.created_at, b.archived_at, b.owner_user_id,
        u.full_name as owner_name, u.phone as owner_phone,
        au.email as owner_email,
        (select count(*)::int from public.customer_memberships m join public.loyalty_programs p on p.id = m.program_id where p.business_id = b.id) as customers,
        (select count(*)::int from public.transactions t where t.business_id = b.id) as transactions
      from public.businesses b
      left join public.users u on u.id = b.owner_user_id
      left join auth.users au on au.id = b.owner_user_id
      where b.archived_at is not null
      order by b.archived_at desc
    `),
  ])
  const businesses = activeResult.rows
  const archivedBusinesses = archivedResult.rows
  return {
    businesses,
    archivedBusinesses,
    totals: {
      businesses: businesses.length,
      archivedBusinesses: archivedBusinesses.length,
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
      select m.*, p.business_id, p.model, p.points_per_currency, p.is_active as program_active, b.status as business_status
      from public.customer_memberships m
      join public.loyalty_programs p on p.id = m.program_id
      join public.businesses b on b.id = p.business_id
      where m.id = $1
      for update
    `, [membershipId])
    const membership = membershipResult.rows[0]
    if (!membership || !membership.is_active) throw httpError(404, 'Membership is not active')
    if (membership.business_status !== 'active') throw httpError(403, 'This business is paused or unavailable')
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
      select m.*, p.business_id, p.model, p.is_active as program_active, b.status as business_status
      from public.customer_memberships m
      join public.loyalty_programs p on p.id = m.program_id
      join public.businesses b on b.id = p.business_id
      where m.id = $1
      for update
    `, [membershipId])
    const membership = membershipResult.rows[0]
    if (!membership || !membership.is_active) throw httpError(404, 'Membership is not active')
    if (membership.business_status !== 'active') throw httpError(403, 'This business is paused or unavailable')

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
