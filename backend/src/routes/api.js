import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { config } from '../config.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { createAdminAuthClient, createAuthClient, createPublicClient, createUserClient } from '../supabase.js'
import { archiveBusiness, createBusinessProvisioning, createEmployee, createSubscriptionPlan, createWorkspace, deleteOrArchiveBusiness, earnLoyalty, finishBusinessProvisioning, getAccessibleBusinessIds, getBusinessPerformance, getBusinessStats, getPendingBusinessSubscription, getPlatformOverview, getSubscriptionPlans, pool, redeemReward, updateBusinessLifecycle, updateSubscriptionPlan } from '../database.js'
import { expireSubscriptions, getBusinessSubscription, recordCashPaymentAndRenew, requireActiveBusinessSubscription, subscriptionAllowsAccess } from '../subscription.js'
import { normalizeEmail, normalizePhone } from '../authUtils.js'

const router = Router()
const staffRoles = ['BUSINESS_OWNER', 'MANAGER', 'EMPLOYEE', 'PLATFORM_ADMIN']
const managerRoles = ['BUSINESS_OWNER', 'MANAGER', 'PLATFORM_ADMIN']
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again later.' } })
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many session refresh attempts. Try again shortly.', code: 'RATE_LIMIT_EXCEEDED' } })
const loyaltyLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many loyalty requests. Try again shortly.' } })
const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Try again shortly.' } })

router.get('/health', (_request, response) => response.json({ ok: true }))

router.post('/auth/login', authLimiter, async (request, response, next) => {
  try {
    const { identifier, identifierType, password } = request.body || {}
    const normalizedEmail = normalizeEmail(identifierType === 'email' ? identifier : '')
    const normalizedPhone = normalizePhone(identifierType === 'phone' ? identifier : '')
    if ((!normalizedEmail && !normalizedPhone) || typeof password !== 'string' || password.length < 8) {
      return response.status(400).json({ error: 'A valid email or phone number and a password of at least 8 characters are required' })
    }
    const credentials = normalizedPhone ? { phone: normalizedPhone, password } : { email: normalizedEmail, password }
    const { data, error } = await createAuthClient().auth.signInWithPassword(credentials)
    if (error) {
      if (normalizedPhone && (error.code === 'phone_provider_disabled' || /phone.*disabled/i.test(error.message))) {
        // Fallback: Check if this phone number is authoritatively associated with an account in auth.users
        // Unverified profile phone numbers in public.users are excluded to prevent account collision/shadowing
        const rawDigits = normalizedPhone.replace(/\D/g, '')
        const lookup = await pool.query(
          `SELECT a.email 
           FROM auth.users a 
           WHERE (a.phone = $1 OR a.phone = $2 OR a.email = 'phone_' || $2 || '@loyaltea.local') 
             AND a.email IS NOT NULL 
           ORDER BY (CASE WHEN a.phone = $1 OR a.phone = $2 THEN 0 ELSE 1 END)
           LIMIT 1`,
          [normalizedPhone, rawDigits]
        )
        if (lookup.rowCount > 0 && lookup.rows[0].email) {
          const bridged = await createAuthClient().auth.signInWithPassword({
            email: lookup.rows[0].email,
            password,
          })
          if (!bridged.error && bridged.data?.session) {
            const expiresIn = Number(bridged.data.session.expires_in) || 3600
            const session = {
              ...bridged.data.session,
              expires_in: expiresIn,
              expires_at: bridged.data.session.expires_at || Math.floor(Date.now() / 1000) + expiresIn,
            }
            return response.json({ session, user: bridged.data.user })
          }
          if (bridged.error) {
            return response.status(401).json({ error: 'Invalid login credentials', code: 'INVALID_CREDENTIALS' })
          }
        }
        return response.status(401).json({
          error: 'Invalid login credentials',
          code: 'INVALID_CREDENTIALS',
        })
      }
      return response.status(401).json({ error: error.message, code: error.code || 'INVALID_CREDENTIALS' })
    }
    const expiresIn = Number(data.session.expires_in) || 3600
    const session = {
      ...data.session,
      expires_in: expiresIn,
      expires_at: data.session.expires_at || Math.floor(Date.now() / 1000) + expiresIn,
    }
    return response.json({ session, user: data.user })
  } catch (error) {
    return next(error)
  }
})

router.post('/auth/signup', authLimiter, async (request, response, next) => {
  try {
    if (!config.publicSignupEnabled) return response.status(403).json({ error: 'Public signup is currently disabled' })
    const { email, phone, password, fullName, role = 'CUSTOMER' } = request.body || {}
    const normalizedEmail = normalizeEmail(email)
    const normalizedPhone = normalizePhone(phone)
    if (typeof password !== 'string' || password.length < 8) {
      return response.status(400).json({ error: 'A password of at least 8 characters is required' })
    }
    if (typeof fullName !== 'string' || !fullName.trim()) {
      return response.status(400).json({ error: 'Full name is required' })
    }
    if (!normalizedPhone && !normalizedEmail) {
      return response.status(400).json({ error: 'A valid phone number is required' })
    }
    if (role && role !== 'CUSTOMER') {
      return response.status(403).json({
        error: 'Public registration is restricted to customer accounts only. Business owners and administrators must be provisioned by a platform administrator.',
        code: 'UNAUTHORIZED_ROLE_REGISTRATION',
      })
    }

    // Check if phone number is already registered to prevent duplicate/ambiguous accounts
    if (normalizedPhone) {
      const existingPhone = await pool.query('select id from public.users where phone = $1 limit 1', [normalizedPhone])
      if (existingPhone.rowCount > 0) {
        return response.status(409).json({
          error: 'This phone number is already registered to an existing account. Please sign in using your existing account.',
          code: 'PHONE_ALREADY_EXISTS',
        })
      }
    }

    if (normalizedEmail) {
      const existingEmail = await pool.query('select id from auth.users where lower(email) = lower($1) limit 1', [normalizedEmail])
      if (existingEmail.rowCount > 0) {
        return response.status(409).json({
          error: 'An account with this email address already exists. Please sign in instead.',
          code: 'USER_ALREADY_EXISTS',
        })
      }
    }

    const rawDigits = normalizedPhone ? normalizedPhone.replace(/\D/g, '') : ''
    const authEmail = normalizedEmail || `phone_${rawDigits}@loyaltea.local`

    // Use admin client to create pre-confirmed customer account with zero email confirmation or SMS OTP needed
    const { data: createdData, error: createError } = await createAdminAuthClient().auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      password,
      user_metadata: {
        full_name: fullName.trim(),
        role: 'CUSTOMER',
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(normalizedEmail ? { real_email: normalizedEmail } : {}),
      },
    })

    if (createError) {
      if (/already registered|already in use|unique constraint/i.test(createError.message)) {
        return response.status(409).json({
          error: 'An account with this email or phone number already exists. Please sign in instead.',
          code: 'USER_ALREADY_EXISTS',
        })
      }
      return response.status(400).json({ error: createError.message, code: createError.code })
    }

    // Ensure public.users and public.customers are populated
    await pool.query(
      `INSERT INTO public.users (id, role, full_name, phone)
       VALUES ($1, 'CUSTOMER', $2, $3)
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = coalesce(EXCLUDED.phone, public.users.phone), updated_at = now()`,
      [createdData.user.id, fullName.trim(), normalizedPhone || null]
    )
    await pool.query(
      `INSERT INTO public.customers (id, email)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = coalesce(EXCLUDED.email, public.customers.email), updated_at = now()`,
      [createdData.user.id, normalizedEmail || null]
    )

    // Sign in immediately to provide live session tokens
    const { data: signinData, error: signinError } = await createAuthClient().auth.signInWithPassword({
      email: authEmail,
      password,
    })

    if (signinError || !signinData?.session) {
      return response.status(201).json({
        user: createdData.user,
        session: null,
        confirmationRequired: false,
      })
    }

    const expiresIn = Number(signinData.session.expires_in) || 3600
    const session = {
      ...signinData.session,
      expires_in: expiresIn,
      expires_at: signinData.session.expires_at || Math.floor(Date.now() / 1000) + expiresIn,
    }

    return response.status(201).json({ session, user: signinData.user, confirmationRequired: false })
  } catch (error) {
    return next(error)
  }
})

router.post('/auth/refresh', refreshLimiter, async (request, response, next) => {
  try {
    const { refreshToken } = request.body || {}
    if (!refreshToken || typeof refreshToken !== 'string') return response.status(400).json({ error: 'refreshToken is required', code: 'MISSING_REFRESH_TOKEN' })
    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session) return response.status(401).json({ error: error?.message || 'Refresh token is invalid or expired', code: error?.code || 'INVALID_REFRESH_TOKEN' })
    const expiresIn = Number(data.session.expires_in) || 3600
    const session = {
      ...data.session,
      expires_in: expiresIn,
      expires_at: data.session.expires_at || Math.floor(Date.now() / 1000) + expiresIn,
    }
    return response.json({ session, user: data.user })
  } catch (error) {
    return next(error)
  }
})

router.post('/auth/logout', async (request, response, next) => {
  try {
    const authorization = request.get('authorization')
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : null
    if (accessToken) {
      try {
        await createUserClient(accessToken).auth.signOut()
      } catch {
        // Silently ignore if token is already expired or already signed out
      }
    }
    return response.status(204).end()
  } catch (error) {
    return next(error)
  }
})

router.get('/public/programs/:programId', publicLimiter, async (request, response, next) => {
  try {
    if (!isUuid(request.params.programId)) return response.status(404).json({ error: 'Program not found' })
    const progRes = await pool.query(
      `SELECT p.id, p.name, p.description, p.model, p.points_per_currency, p.currency_unit, p.business_id, p.is_active,
              b.id as b_id, b.name as b_name, b.slug as b_slug, b.logo_url as b_logo_url, b.status as b_status
       FROM public.loyalty_programs p
       JOIN public.businesses b ON b.id = p.business_id
       WHERE p.id = $1 AND p.is_active = true AND b.archived_at IS NULL`,
      [request.params.programId]
    )
    if (!progRes.rowCount) return response.status(404).json({ error: 'Program not found' })
    const row = progRes.rows[0]
    const rewardsRes = await pool.query(
      `SELECT id, name, description, image_url, required_stamps, required_points, expires_at, is_active
       FROM public.rewards
       WHERE program_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > now())
       ORDER BY required_stamps ASC, required_points ASC`,
      [row.id]
    )
    const subscription = await getBusinessSubscription(row.business_id)
    return response.json({
      program: {
        id: row.id,
        name: row.name,
        description: row.description,
        model: row.model,
        points_per_currency: row.points_per_currency,
        currency_unit: row.currency_unit,
        business_id: row.business_id,
        businesses: {
          id: row.b_id,
          name: row.b_name,
          slug: row.b_slug,
          logo_url: row.b_logo_url,
          status: row.b_status,
        },
        rewards: rewardsRes.rows,
      },
      acceptingMemberships: row.b_status === 'active' && subscriptionAllowsAccess(subscription),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/public/businesses/:businessSlug', publicLimiter, async (request, response, next) => {
  try {
    const slug = (request.params.businessSlug || '').trim().toLowerCase()
    if (!slug) return response.status(400).json({ error: 'Business slug is required' })

    const busRes = await pool.query(
      `SELECT id, name, slug, status, logo_url
       FROM public.businesses
       WHERE lower(slug) = lower($1) AND archived_at IS NULL
       LIMIT 1`,
      [slug]
    )
    if (!busRes.rowCount) {
      return response.status(404).json({ error: 'Business not found', code: 'BUSINESS_NOT_FOUND' })
    }
    const business = busRes.rows[0]

    let progRes = await pool.query(
      `SELECT id, name, description, model, points_per_currency, currency_unit, is_active
       FROM public.loyalty_programs
       WHERE business_id = $1 AND is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
      [business.id]
    )

    if (!progRes.rowCount) {
      const anyProgRes = await pool.query(
        `SELECT id FROM public.loyalty_programs WHERE business_id = $1 LIMIT 1`,
        [business.id]
      )
      if (!anyProgRes.rowCount) {
        // Auto-heal: newly created businesses that lack an initial program
        const newProg = await pool.query(
          `INSERT INTO public.loyalty_programs (business_id, name, model, is_active)
           VALUES ($1, $2, 'STAMPS', true)
           RETURNING id, name, description, model, points_per_currency, currency_unit, is_active`,
          [business.id, `${business.name} Program`]
        )
        await pool.query(
          `INSERT INTO public.rewards (program_id, name, description, required_stamps, is_active)
           VALUES ($1, 'Free Reward', 'Claim 1 free reward after 10 stamps', 10, true)`,
          [newProg.rows[0].id]
        )
        progRes = newProg
      } else {
        // The business exists, but its program is currently deactivated
        return response.status(404).json({
          error: 'No active loyalty program found for this business',
          code: 'NO_ACTIVE_PROGRAM',
          business: { id: business.id, name: business.name, slug: business.slug, logo_url: business.logo_url, status: business.status },
        })
      }
    }

    const program = progRes.rows[0]
    const rewardsRes = await pool.query(
      `SELECT id, name, description, image_url, required_stamps, required_points, expires_at, is_active
       FROM public.rewards
       WHERE program_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > now())
       ORDER BY required_stamps ASC, required_points ASC`,
      [program.id]
    )

    const subscription = await getBusinessSubscription(business.id)
    return response.json({
      business: { id: business.id, name: business.name, slug: business.slug, logo_url: business.logo_url, status: business.status },
      program: {
        ...program,
        business_id: business.id,
        businesses: { id: business.id, name: business.name, slug: business.slug, logo_url: business.logo_url },
        rewards: rewardsRes.rows,
      },
      acceptingMemberships: business.status === 'active' && subscriptionAllowsAccess(subscription),
    })
  } catch (error) {
    return next(error)
  }
})

router.use(requireAuth)

router.get('/me', async (request, response, next) => {
  try {
    const { data, error } = await request.supabase
      .from('users')
      .select('id, role, full_name, phone, customers(email), employees(id, business_id, role, is_active, permissions)')
      .eq('id', request.user.id)
      .maybeSingle()
    if (error) return next(error)
    const pendingSubscription = data?.role === 'BUSINESS_OWNER' ? await getPendingBusinessSubscription(request.user.id) : null
    return response.json({ profile: data, pendingSubscription })
  } catch (error) {
    return next(error)
  }
})

router.get('/customer/memberships', async (request, response, next) => {
  try {
    const { data, error } = await request.supabase
      .from('customer_memberships')
      .select('id, secure_token, stamps_balance, points_balance, is_active, joined_at, updated_at, loyalty_programs(id, name, description, model, currency_unit, businesses(name, logo_url), rewards(id, name, description, required_stamps, required_points, expires_at, is_active))')
      .eq('customer_id', request.user.id)
      .order('updated_at', { ascending: false })
    if (error) return next(error)

    const membershipIds = (data || []).map((membership) => membership.id)
    let transactions = []
    if (membershipIds.length) {
      const { data: transactionData, error: transactionError } = await request.supabase
        .from('transactions')
        .select('id, membership_id, type, stamps_delta, points_delta, metadata, created_at')
        .in('membership_id', membershipIds)
        .order('created_at', { ascending: false })
        .limit(100)
      if (transactionError) return next(transactionError)
      transactions = transactionData || []
    }

    return response.json({ memberships: data || [], transactions })
  } catch (error) {
    return next(error)
  }
})

router.get('/activity', async (request, response, next) => {
  try {
    const rawLimit = Number(request.query.limit)
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 2
    const rawOffset = Number(request.query.offset)
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0
    const requestedBusinessId = request.query.businessId && isUuid(request.query.businessId) ? request.query.businessId : null

    const conditions = []
    const params = []
    let pIdx = 1

    if (request.profile?.role === 'PLATFORM_ADMIN') {
      if (requestedBusinessId) {
        conditions.push(`t.business_id = ${pIdx++}`)
        params.push(requestedBusinessId)
      }
    } else if (staffRoles.includes(request.profile?.role)) {
      if (requestedBusinessId) {
        if (!request.businessIds.includes(requestedBusinessId)) {
          return response.status(403).json({ error: 'Business access denied' })
        }
        conditions.push(`t.business_id = ${pIdx++}`)
        params.push(requestedBusinessId)
      } else {
        if (!request.businessIds.length) {
          return response.json({ activities: [], hasMore: false, total: 0 })
        }
        conditions.push(`t.business_id = ANY(${pIdx++})`)
        params.push(request.businessIds)
      }
    } else if (request.profile?.role === 'CUSTOMER') {
      conditions.push(`m.customer_id = ${pIdx++}`)
      params.push(request.user.id)
      if (requestedBusinessId) {
        conditions.push(`t.business_id = ${pIdx++}`)
        params.push(requestedBusinessId)
      }
    } else {
      return response.status(403).json({ error: 'Access denied' })
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const countQuery = `
      SELECT count(*)::int as total
      FROM public.transactions t
      JOIN public.customer_memberships m ON m.id = t.membership_id
      ${whereClause}
    `
    const countRes = await pool.query(countQuery, params)
    const total = countRes.rows[0]?.total || 0

    const queryParams = [...params, limit, offset]
    const listQuery = `
      SELECT 
        t.id,
        t.membership_id,
        t.business_id,
        t.location_id,
        t.employee_id,
        t.type,
        t.stamps_delta,
        t.points_delta,
        t.metadata,
        t.created_at,
        b.name AS business_name,
        u.full_name AS customer_name,
        c.email AS customer_email,
        u.phone AS customer_phone
      FROM public.transactions t
      JOIN public.customer_memberships m ON m.id = t.membership_id
      JOIN public.businesses b ON b.id = t.business_id
      LEFT JOIN public.users u ON u.id = m.customer_id
      LEFT JOIN public.customers c ON c.id = m.customer_id
      ${whereClause}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ${queryParams.length - 1} OFFSET ${queryParams.length}
    `
    const listRes = await pool.query(listQuery, queryParams)
    const activities = listRes.rows
    const hasMore = offset + activities.length < total

    return response.json({
      activities,
      hasMore,
      total,
      limit,
      offset,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/admin/overview', requireRoles('PLATFORM_ADMIN'), async (_request, response, next) => {
  try {
    return response.json(await getPlatformOverview())
  } catch (error) {
    return next(error)
  }
})

router.get('/admin/subscription-plans', requireRoles('PLATFORM_ADMIN'), async (_request, response, next) => {
  try {
    return response.json({ plans: await getSubscriptionPlans(true) })
  } catch (error) {
    return next(error)
  }
})

router.post('/admin/subscription-plans', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try {
    const { name, description, price, currency, durationDays, features } = request.body || {}
    if (!name?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(durationDays)) || Number(durationDays) <= 0) return response.status(400).json({ error: 'Plan name, non-negative price, and positive duration are required' })
    return response.status(201).json({ plan: await createSubscriptionPlan({ actorUserId: request.user.id, name: name.trim(), description, price: Number(price), currency, durationDays: Number(durationDays), features }) })
  } catch (error) { return next(error) }
})

router.patch('/admin/subscription-plans/:planId', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try {
    const { name, description, price, currency, durationDays, features, isActive } = request.body || {}
    if (!isUuid(request.params.planId) || !name?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(durationDays)) || Number(durationDays) <= 0 || typeof isActive !== 'boolean') return response.status(400).json({ error: 'Valid plan fields are required' })
    return response.json({ plan: await updateSubscriptionPlan({ actorUserId: request.user.id, planId: request.params.planId, name: name.trim(), description, price: Number(price), currency, durationDays: Number(durationDays), features, isActive }) })
  } catch (error) { return next(error) }
})

router.post('/admin/businesses/provision', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  let createdAuthUserId = null
  try {
    const { businessName, slug, ownerEmail, ownerPhone, ownerFullName, ownerPassword, planId } = request.body || {}
    if (!businessName || !slug || !ownerFullName || !ownerPassword || (!ownerEmail && !ownerPhone) || !isUuid(planId)) return response.status(400).json({ error: 'Business name, slug, owner name, owner password, email or phone, and plan are required' })
    if (ownerPassword.length < 8) return response.status(400).json({ error: 'Owner password must contain at least 8 characters' })
    const provisioning = await createBusinessProvisioning({ adminUserId: request.user.id, businessName: businessName.trim(), slug: slug.trim().toLowerCase(), ownerEmail: ownerEmail?.trim().toLowerCase(), ownerPhone: ownerPhone ? normalizePhone(ownerPhone) : null, ownerFullName: ownerFullName.trim(), ownerPassword, planId })
    if (ownerPhone && !provisioning.identity.phone) return response.status(400).json({ error: 'Owner phone must be a valid E.164 number' })
    const { data, error } = await createAdminAuthClient().auth.admin.createUser(provisioning.identity)
    if (error || !data.user) return response.status(400).json({ error: error?.message || 'Owner account could not be created' })
    createdAuthUserId = data.user.id
    await new Promise((resolve) => setTimeout(resolve, 50))
    const result = await finishBusinessProvisioning({ ownerUserId: data.user.id, adminUserId: request.user.id, businessName: provisioning.businessName, slug: provisioning.slug, planId })
    return response.status(201).json({ ...result, owner: { id: data.user.id, email: data.user.email, phone: data.user.phone } })
  } catch (error) {
    if (createdAuthUserId) await createAdminAuthClient().auth.admin.deleteUser(createdAuthUserId).catch(() => {})
    return next(error)
  }
})

router.get('/businesses/:businessId/subscription', requireRoles(...staffRoles), async (request, response, next) => {
  try {
    if (!isUuid(request.params.businessId)) return response.status(400).json({ error: 'Invalid business identifier' })
    if (!request.businessIds.includes(request.params.businessId)) return response.status(403).json({ error: 'Business access denied' })
    const subscription = await getBusinessSubscription(request.params.businessId)
    return response.json({ subscription, active: subscriptionAllowsAccess(subscription) })
  } catch (error) {
    return next(error)
  }
})

router.post('/admin/subscriptions/renew-cash', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try {
    const { businessId, planId, amount, currency, startsAt, receivedAt, reference, notes, idempotencyKey } = request.body || {}
    if (!isUuid(businessId) || !isUuid(planId) || !isUuid(idempotencyKey) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return response.status(400).json({ error: 'businessId, planId, amount, and a valid idempotencyKey are required' })
    const result = await recordCashPaymentAndRenew({ businessId, planId, amount: Number(amount), currency, startsAt, receivedAt, reference, notes, actorUserId: request.user.id, idempotencyKey })
    return response.status(result.replayed ? 200 : 201).json(result)
  } catch (error) {
    return next(error)
  }
})

router.post('/admin/businesses/:businessId/pause', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try {
    if (!isUuid(request.params.businessId)) return response.status(400).json({ error: 'Invalid business identifier' })
    return response.json({ business: await updateBusinessLifecycle({ businessId: request.params.businessId, status: 'paused', actorUserId: request.user.id }) })
  } catch (error) { return next(error) }
})
router.post('/admin/businesses/:businessId/resume', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try {
    if (!isUuid(request.params.businessId)) return response.status(400).json({ error: 'Invalid business identifier' })
    return response.json({ business: await updateBusinessLifecycle({ businessId: request.params.businessId, status: 'active', actorUserId: request.user.id }) })
  } catch (error) { return next(error) }
})
router.delete('/admin/businesses/:businessId', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try {
    if (!isUuid(request.params.businessId)) return response.status(400).json({ error: 'Invalid business identifier' })
    const mode = request.query.mode || request.body?.mode || 'auto'
    return response.json(await deleteOrArchiveBusiness({ businessId: request.params.businessId, actorUserId: request.user.id, mode }))
  } catch (error) { return next(error) }
})

router.post('/admin/subscriptions/expire', requireRoles('PLATFORM_ADMIN'), async (_request, response, next) => {
  try {
    return response.json({ expired: await expireSubscriptions() })
  } catch (error) {
    return next(error)
  }
})

router.get('/loyalty/lookup/:secureToken', requireRoles(...staffRoles), async (request, response, next) => {
  try {
    if (!isUuid(request.params.secureToken)) return response.status(400).json({ error: 'Invalid membership token' })
    const { data, error } = await request.supabase
      .from('customer_memberships')
      .select('id, stamps_balance, points_balance, is_active, loyalty_programs(id, name, model, business_id, businesses(name)), customers(email)')
      .eq('secure_token', request.params.secureToken)
      .maybeSingle()
    if (error) return next(error)
    if (!data || !request.businessIds.includes(data.loyalty_programs?.business_id)) return response.status(404).json({ error: 'Membership not found' })
    return response.json({ membership: data })
  } catch (error) {
    return next(error)
  }
})

router.post('/businesses/onboard', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try {
    const { businessName, slug, locationName, address, programName, model, pointsPerCurrency, currencyUnit, rewardName, rewardDescription, threshold } = request.body || {}
    if (!businessName || !slug || !locationName || !programName || !rewardName || !['STAMPS', 'POINTS'].includes(model) || !Number.isInteger(Number(threshold)) || Number(threshold) <= 0) {
      return response.status(400).json({ error: 'Business, location, program, reward, model, and a positive threshold are required' })
    }
    if (model === 'POINTS' && !(Number(pointsPerCurrency) > 0)) return response.status(400).json({ error: 'Points programs require a positive pointsPerCurrency value' })
    const workspace = await createWorkspace({ userId: request.user.id, businessName, slug, locationName, address, programName, model, pointsPerCurrency: Number(pointsPerCurrency), currencyUnit, rewardName, rewardDescription, threshold: Number(threshold) })
    return response.status(201).json(workspace)
  } catch (error) {
    return next(error)
  }
})

router.get('/businesses', requireRoles(...staffRoles), async (request, response, next) => listTable(request, response, next, 'businesses'))
router.post('/businesses', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => insertTable(request, response, next, 'businesses', ['name', 'slug', 'logo_url'], { owner_user_id: request.user.id }))

router.post('/public/programs/:programId/join', publicLimiter, requireRoles('CUSTOMER'), async (request, response, next) => {
  try {
    if (!isUuid(request.params.programId)) return response.status(400).json({ error: 'Invalid program identifier' })
    const { data: program, error: programError } = await request.supabase
      .from('loyalty_programs')
      .select('id, is_active, business_id')
      .eq('id', request.params.programId)
      .eq('is_active', true)
      .maybeSingle()
    if (programError) return next(programError)
    if (!program) return response.status(404).json({ error: 'Program not found or inactive' })
    const { data: business, error: businessError } = await request.supabase.from('businesses').select('status').eq('id', program.business_id).maybeSingle()
    if (businessError) return next(businessError)
    const subscription = await getBusinessSubscription(program.business_id)
    if (business?.status !== 'active' || !subscriptionAllowsAccess(subscription)) return response.status(403).json({ error: 'This business is not currently accepting new memberships', code: 'BUSINESS_SUBSCRIPTION_INACTIVE' })
    const existingMembership = await request.supabase.from('customer_memberships').select('id, is_active').eq('customer_id', request.user.id).eq('program_id', request.params.programId).maybeSingle()
    if (existingMembership.error) return next(existingMembership.error)
    if (existingMembership.data?.is_active) return response.status(409).json({ error: 'You are already enrolled in this business program', code: 'MEMBERSHIP_EXISTS' })
    const { data, error } = await request.supabase
      .from('customer_memberships')
      .upsert({ customer_id: request.user.id, program_id: request.params.programId, is_active: true }, { onConflict: 'customer_id,program_id' })
      .select()
      .single()
    if (error) return next(error)
    return response.status(201).json({ membership: data })
  } catch (error) {
    return next(error)
  }
})

router.get('/dashboard', requireRoles(...staffRoles), requireActiveBusinessSubscription, async (request, response, next) => {
  try {
    const rawPeriod = request.query.period
    if (rawPeriod !== undefined && !['30', '90', '365'].includes(String(rawPeriod))) {
      return response.status(400).json({ error: 'Period must be 30, 90, or 365 days', code: 'INVALID_PERIOD' })
    }
    const period = rawPeriod !== undefined ? Number(rawPeriod) : 30

    const requestedBusinessId = request.query.businessId
    if (requestedBusinessId !== undefined && requestedBusinessId !== '') {
      if (!isUuid(requestedBusinessId)) {
        return response.status(400).json({ error: 'Invalid business identifier', code: 'INVALID_BUSINESS_ID' })
      }
      if (!request.businessIds.includes(requestedBusinessId)) {
        return response.status(403).json({ error: 'Business access denied', code: 'BUSINESS_ACCESS_DENIED' })
      }
    }

    if (!request.businessIds?.length) {
      return response.json({
        business: null,
        program: null,
        customers: [],
        transactions: [],
        redemptions: [],
        stats: emptyStats(),
        performance: { period, points: [] },
      })
    }

    const selectedBusinessId = (requestedBusinessId && request.businessIds.includes(requestedBusinessId))
      ? requestedBusinessId
      : (request.activeBusinessIds?.[0] || request.businessIds[0])

    if (request.profile?.role !== 'PLATFORM_ADMIN' && !request.activeBusinessIds?.includes(selectedBusinessId)) {
      return response.status(402).json({ error: 'The selected business subscription is inactive', code: 'SUBSCRIPTION_REQUIRED' })
    }

    const { data: businesses, error: businessError } = await request.supabase
      .from('businesses')
      .select('id, name, slug, status, logo_url, business_locations(id, name, is_active), loyalty_programs(id, name, description, model, points_per_currency, currency_unit, is_active, rewards(id, name, description, required_stamps, required_points, expires_at, is_active))')
      .eq('id', selectedBusinessId)
      .order('created_at', { ascending: true })
      .limit(1)

    if (businessError) return next(businessError)
    const business = businesses?.[0]
    if (!business) {
      return response.json({
        business: null,
        program: null,
        customers: [],
        transactions: [],
        redemptions: [],
        stats: emptyStats(),
        performance: { period, points: [] },
      })
    }

    // PostgREST embeds 1-to-1 relationships as a single object when a UNIQUE constraint exists,
    // or as an array when 1-to-many. Normalize safely to an object or null:
    const rawProgram = business.loyalty_programs
    const program = Array.isArray(rawProgram)
      ? (rawProgram.find((item) => item.is_active) ?? rawProgram[0] ?? null)
      : (rawProgram || null)

    if (!program) {
      return response.json({
        business,
        program: null,
        customers: [],
        transactions: [],
        redemptions: [],
        stats: emptyStats(),
        performance: { period, points: [] },
      })
    }

    const [membershipResult, { data: transactions, error: transactionError }, { data: redemptions, error: redemptionError }, rewardsResult] = await Promise.all([
      pool.query(`
        SELECT cm.id, cm.customer_id, cm.secure_token, cm.stamps_balance, cm.points_balance, cm.is_active, cm.joined_at, cm.updated_at,
               u.full_name, u.phone,
               c.email as customer_email,
               au.email as auth_email
        FROM public.customer_memberships cm
        LEFT JOIN public.users u ON u.id = cm.customer_id
        LEFT JOIN public.customers c ON c.id = cm.customer_id
        LEFT JOIN auth.users au ON au.id = cm.customer_id
        WHERE cm.program_id = $1
        ORDER BY cm.updated_at DESC
        LIMIT 100
      `, [program.id]),
      request.supabase.from('transactions').select('id, membership_id, type, stamps_delta, points_delta, created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(100),
      request.supabase.from('reward_redemptions').select('id, membership_id, reward_id, created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(100),
      pool.query(`
        SELECT id, program_id, name, description, image_url, required_stamps, required_points, expires_at, is_active, created_at, updated_at
        FROM public.rewards
        WHERE program_id = $1
        ORDER BY created_at ASC
      `, [program.id]),
    ])
    if (transactionError) return next(transactionError)
    if (redemptionError) return next(redemptionError)

    // Populate full rewards array for program management
    program.rewards = rewardsResult.rows || []

    const customers = (membershipResult.rows || []).map((m) => ({
      id: m.id,
      customerId: m.customer_id,
      cardId: m.secure_token,
      name: m.full_name || m.customer_email || m.auth_email || 'Customer',
      email: m.customer_email || m.auth_email || '',
      phone: m.phone || '',
      stamps: program.model === 'STAMPS' ? m.stamps_balance : m.points_balance,
      stampsBalance: m.stamps_balance,
      pointsBalance: m.points_balance,
      unit: program.model === 'STAMPS' ? 'stamps' : 'points',
      isActive: m.is_active,
      joinedAt: m.joined_at,
      updatedAt: m.updated_at,
    }))

    let stats
    let performance
    try {
      ;[stats, performance] = await Promise.all([getBusinessStats(business.id), getBusinessPerformance(business.id, period)])
    } catch (error) {
      console.error(JSON.stringify({ event: 'dashboard_metrics_query_error', businessId: business.id, period, error: error.message }))
      error.status = error.status && error.status < 500 ? error.status : 500
      error.code = 'DASHBOARD_METRICS_QUERY_FAILED'
      error.message = 'Failed to load business statistics'
      throw error
    }

    return response.json({
      business,
      program,
      customers,
      transactions: transactions ?? [],
      redemptions: redemptions ?? [],
      stats,
      performance: { period, points: performance },
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/loyalty/earn', loyaltyLimiter, requireRoles(...staffRoles), requireActiveBusinessSubscription, async (request, response, next) => {
  try {
    const { membershipId, locationId, model, amount, requestId } = request.body || {}
    if (!membershipId || !locationId || !['STAMPS', 'POINTS'].includes(model) || !isUuid(requestId)) return response.status(400).json({ error: 'membershipId, locationId, model, and a valid requestId are required' })
    if (model === 'POINTS' && (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > 1_000_000)) return response.status(400).json({ error: 'Points earning requires a finite purchase amount between 0 and 1,000,000' })
    const transaction = await earnLoyalty({ userId: request.user.id, membershipId, locationId, model, amount: Number(amount), requestId })
    return response.status(201).json({ transaction })
  } catch (error) {
    return next(error)
  }
})

router.post('/loyalty/redeem', loyaltyLimiter, requireRoles(...staffRoles), requireActiveBusinessSubscription, async (request, response, next) => {
  try {
    const { membershipId, rewardId, locationId, requestId } = request.body || {}
    if (!membershipId || !rewardId || !locationId || !isUuid(requestId)) return response.status(400).json({ error: 'membershipId, rewardId, locationId, and a valid requestId are required' })
    const redemption = await redeemReward({ userId: request.user.id, membershipId, rewardId, locationId, requestId })
    return response.status(201).json({ redemption })
  } catch (error) {
    return next(error)
  }
})

router.get('/programs', requireRoles(...staffRoles), async (request, response, next) => listTable(request, response, next, 'loyalty_programs', 'business_id'))
router.get('/rewards', requireRoles(...staffRoles), async (request, response, next) => listTable(request, response, next, 'rewards', 'program_id'))
router.get('/customers', requireRoles(...staffRoles), async (request, response, next) => listTable(request, response, next, 'customer_memberships', 'program_id'))
router.get('/locations', requireRoles(...staffRoles), async (request, response, next) => listTable(request, response, next, 'business_locations', 'business_id'))
router.get('/employees', requireRoles(...managerRoles), async (request, response, next) => listTable(request, response, next, 'employees', 'business_id'))
router.get('/memberships/:membershipId', async (request, response, next) => {
  try {
    if (!isUuid(request.params.membershipId)) return response.status(400).json({ error: 'Invalid membership identifier' })
    const { data: accessRecord, error: accessError } = await request.supabase
      .from('customer_memberships')
      .select('customer_id, loyalty_programs(business_id)')
      .eq('id', request.params.membershipId)
      .maybeSingle()
    if (accessError) return next(accessError)
    if (!accessRecord) return response.status(404).json({ error: 'Membership not found' })
    const accessibleBusinessIds = await getAccessibleBusinessIds(request.user.id)
    const ownsMembership = accessRecord.customer_id === request.user.id
    const canManageBusiness = accessibleBusinessIds.includes(accessRecord.loyalty_programs?.business_id)
    if (!ownsMembership && !canManageBusiness) return response.status(403).json({ error: 'Membership access denied' })

    const { data, error } = await request.supabase
      .from('customer_memberships')
      .select('id, customer_id, program_id, stamps_balance, points_balance, is_active, joined_at, updated_at, loyalty_programs(id, name, model, business_id, businesses(name)), rewards(id, name, description, required_stamps, required_points, expires_at, is_active)')
      .eq('id', request.params.membershipId)
      .maybeSingle()
    if (error) return next(error)
    if (!data) return response.status(404).json({ error: 'Membership not found' })
    const { data: transactions, error: transactionError } = await request.supabase.from('transactions').select('id, membership_id, business_id, location_id, employee_id, type, stamps_delta, points_delta, created_at').eq('membership_id', request.params.membershipId).order('created_at', { ascending: false }).limit(100)
    if (transactionError) return next(transactionError)
    return response.json({ membership: data, transactions })
  } catch (error) {
    return next(error)
  }
})
router.post('/programs', requireRoles(...managerRoles), async (request, response, next) => {
  try {
    const { business_id, name, description, model, points_per_currency, currency_unit, is_active } = request.body || {}
    if (!business_id || !isUuid(business_id)) {
      return response.status(400).json({ error: 'A valid business identifier is required', code: 'INVALID_BUSINESS_ID' })
    }
    if (!request.businessIds.includes(business_id)) {
      return response.status(403).json({ error: 'Business access denied', code: 'BUSINESS_ACCESS_DENIED' })
    }
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName || trimmedName.length > 120) {
      return response.status(400).json({ error: 'Program name must be between 1 and 120 characters', code: 'INVALID_PROGRAM_NAME' })
    }

    const selectedModel = model || 'STAMPS'
    if (!['STAMPS', 'POINTS'].includes(selectedModel)) {
      return response.status(400).json({ error: 'Model must be STAMPS or POINTS', code: 'INVALID_MODEL' })
    }

    let effectivePpc = null
    if (selectedModel === 'POINTS') {
      const parsed = Number(points_per_currency)
      if (Number.isNaN(parsed) || parsed <= 0) {
        return response.status(400).json({ error: 'Points per currency unit is required for points-based programs and must be greater than 0', code: 'INVALID_POINTS_PER_CURRENCY' })
      }
      effectivePpc = parsed
    }

    const sanitizedDesc = typeof description === 'string' && description.trim() ? description.trim() : null
    const sanitizedCurrency = typeof currency_unit === 'string' && currency_unit.trim() ? currency_unit.trim().toUpperCase().slice(0, 6) : 'DZD'
    const activeFlag = is_active !== undefined ? Boolean(is_active) : true

    // Check if a loyalty program already exists for this business to avoid duplicate program records
    const existingProg = await pool.query(
      'SELECT id, business_id FROM public.loyalty_programs WHERE business_id = $1',
      [business_id]
    )

    if (existingProg.rowCount > 0) {
      const progId = existingProg.rows[0].id
      const updated = await pool.query(
        `UPDATE public.loyalty_programs
         SET name = $1, description = $2, model = $3, points_per_currency = $4, currency_unit = $5, is_active = $6, updated_at = now()
         WHERE id = $7
         RETURNING id, business_id, name, description, model, points_per_currency, currency_unit, is_active, created_at, updated_at`,
        [trimmedName, sanitizedDesc, selectedModel, effectivePpc, sanitizedCurrency, activeFlag, progId]
      )
      return response.status(200).json({ program: updated.rows[0], data: updated.rows[0] })
    }

    const inserted = await pool.query(
      `INSERT INTO public.loyalty_programs (business_id, name, description, model, points_per_currency, currency_unit, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, business_id, name, description, model, points_per_currency, currency_unit, is_active, created_at, updated_at`,
      [business_id, trimmedName, sanitizedDesc, selectedModel, effectivePpc, sanitizedCurrency, activeFlag]
    )
    return response.status(201).json({ program: inserted.rows[0], data: inserted.rows[0] })
  } catch (error) {
    if (error.code === '23514') {
      return response.status(400).json({ error: 'Invalid loyalty program configuration. Stamps programs cannot have points per currency, and points programs must have points per currency greater than 0.', code: 'CHECK_VIOLATION' })
    }
    if (error.code === '23505') {
      return response.status(409).json({ error: 'A loyalty program already exists for this business.', code: 'PROGRAM_ALREADY_EXISTS' })
    }
    console.error(JSON.stringify({ event: 'program_create_error', error: error.message, code: error.code }))
    return next(error)
  }
})

router.patch('/programs/:programId', requireRoles(...managerRoles), async (request, response, next) => {
  try {
    if (!isUuid(request.params.programId)) return response.status(400).json({ error: 'Invalid program identifier', code: 'INVALID_PROGRAM_ID' })
    const { name, description, model, points_per_currency, currency_unit, is_active } = request.body || {}

    const progResult = await pool.query(
      'SELECT id, business_id, model, points_per_currency FROM public.loyalty_programs WHERE id = $1',
      [request.params.programId]
    )
    if (!progResult.rowCount) return response.status(404).json({ error: 'Program not found', code: 'PROGRAM_NOT_FOUND' })
    const currentProgram = progResult.rows[0]
    if (!request.businessIds.includes(currentProgram.business_id)) return response.status(403).json({ error: 'Program access denied', code: 'PROGRAM_ACCESS_DENIED' })

    if (model !== undefined && !['STAMPS', 'POINTS'].includes(model)) {
      return response.status(400).json({ error: 'Model must be STAMPS or POINTS', code: 'INVALID_MODEL' })
    }

    const effectiveModel = model !== undefined ? model : currentProgram.model

    let effectivePpc = undefined
    if (effectiveModel === 'STAMPS') {
      // Stamps model enforces points_per_currency = NULL in database constraint
      effectivePpc = null
    } else if (effectiveModel === 'POINTS') {
      if (points_per_currency !== undefined && points_per_currency !== null && points_per_currency !== '') {
        const val = Number(points_per_currency)
        if (Number.isNaN(val) || val <= 0) {
          return response.status(400).json({ error: 'Points per currency unit must be greater than 0', code: 'INVALID_POINTS_PER_CURRENCY' })
        }
        effectivePpc = val
      } else if (model === 'POINTS' && currentProgram.model !== 'POINTS') {
        // Switching to POINTS model requires providing a positive points_per_currency value
        return response.status(400).json({ error: 'Points per currency unit is required for points-based programs and must be greater than 0', code: 'INVALID_POINTS_PER_CURRENCY' })
      } else if (currentProgram.points_per_currency === null) {
        return response.status(400).json({ error: 'Points per currency unit is required for points-based programs and must be greater than 0', code: 'INVALID_POINTS_PER_CURRENCY' })
      }
    }

    const updates = []
    const values = [request.params.programId]
    let idx = 2

    if (name !== undefined) {
      const trimmedName = typeof name === 'string' ? name.trim() : ''
      if (!trimmedName || trimmedName.length > 120) {
        return response.status(400).json({ error: 'Program name must be between 1 and 120 characters', code: 'INVALID_PROGRAM_NAME' })
      }
      updates.push(`name = $${idx++}`)
      values.push(trimmedName)
    }

    if (description !== undefined) {
      updates.push(`description = $${idx++}`)
      values.push(description && typeof description === 'string' && description.trim() ? description.trim() : null)
    }

    if (model !== undefined) {
      updates.push(`model = $${idx++}`)
      values.push(model)
    }

    if (effectivePpc !== undefined) {
      updates.push(`points_per_currency = $${idx++}`)
      values.push(effectivePpc)
    }

    if (currency_unit !== undefined) {
      updates.push(`currency_unit = $${idx++}`)
      values.push(currency_unit && typeof currency_unit === 'string' && currency_unit.trim() ? currency_unit.trim().toUpperCase().slice(0, 6) : 'DZD')
    }

    if (is_active !== undefined) {
      const willBeActive = Boolean(is_active)
      if (willBeActive) {
        const existingActive = await pool.query(
          'SELECT id, name FROM public.rewards WHERE program_id = $1 AND is_active = true AND id <> $2 LIMIT 1',
          [rewResult.rows[0].program_id, request.params.rewardId]
        )
        if (existingActive.rowCount > 0) {
          return response.status(409).json({
            error: 'Another active offer already exists for this business. Deactivate it before activating this offer.',
            code: 'ACTIVE_OFFER_EXISTS',
            activeOffer: existingActive.rows[0],
          })
        }
      }
      updates.push(`is_active = ${idx++}`)
      values.push(willBeActive)
    }

    if (!updates.length) return response.status(400).json({ error: 'No update fields provided', code: 'NO_UPDATE_FIELDS' })
    updates.push('updated_at = now()')

    const result = await pool.query(
      `UPDATE public.loyalty_programs SET ${updates.join(', ')} WHERE id = $1 RETURNING id, business_id, name, description, model, points_per_currency, currency_unit, is_active, created_at, updated_at`,
      values
    )
    return response.json({ program: result.rows[0], data: result.rows[0] })
  } catch (error) {
    if (error.code === '23514') {
      return response.status(400).json({ error: 'Invalid loyalty program configuration. Stamps programs cannot have points per currency, and points programs must have points per currency greater than 0.', code: 'CHECK_VIOLATION' })
    }
    if (error.code === '23505') {
      return response.status(409).json({ error: 'A loyalty program already exists for this business.', code: 'PROGRAM_ALREADY_EXISTS' })
    }
    console.error(JSON.stringify({ event: 'program_patch_error', error: error.message, code: error.code }))
    return next(error)
  }
})

router.post('/rewards', requireRoles(...managerRoles), async (request, response, next) => insertTable(request, response, next, 'rewards', ['program_id', 'name', 'description', 'image_url', 'required_stamps', 'required_points', 'expires_at', 'is_active']))
router.patch('/rewards/:rewardId', requireRoles(...managerRoles), async (request, response, next) => {
  try {
    if (!isUuid(request.params.rewardId)) return response.status(400).json({ error: 'Invalid reward identifier' })
    const { name, description, image_url, required_stamps, required_points, expires_at, is_active } = request.body || {}

    const rewResult = await pool.query(
      `SELECT r.id, r.program_id, p.business_id 
       FROM public.rewards r 
       JOIN public.loyalty_programs p ON p.id = r.program_id 
       WHERE r.id = $1`,
      [request.params.rewardId]
    )
    if (!rewResult.rowCount) return response.status(404).json({ error: 'Reward not found' })
    if (!request.businessIds.includes(rewResult.rows[0].business_id)) return response.status(403).json({ error: 'Reward access denied' })

    const updates = []
    const values = [request.params.rewardId]
    let idx = 2

    if (name !== undefined) {
      if (!name?.trim()) return response.status(400).json({ error: 'Reward name cannot be empty' })
      updates.push(`name = $${idx++}`)
      values.push(name.trim())
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`)
      values.push(description?.trim() || null)
    }
    if (image_url !== undefined) {
      updates.push(`image_url = $${idx++}`)
      values.push(image_url?.trim() || null)
    }
    if (required_stamps !== undefined) {
      const val = Number(required_stamps)
      if (!Number.isInteger(val) || val < 0) return response.status(400).json({ error: 'required_stamps must be a non-negative integer' })
      updates.push(`required_stamps = $${idx++}`)
      values.push(val)
    }
    if (required_points !== undefined) {
      const val = Number(required_points)
      if (!Number.isInteger(val) || val < 0) return response.status(400).json({ error: 'required_points must be a non-negative integer' })
      updates.push(`required_points = $${idx++}`)
      values.push(val)
    }
    if (expires_at !== undefined) {
      updates.push(`expires_at = $${idx++}`)
      values.push(expires_at ? new Date(expires_at).toISOString() : null)
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`)
      values.push(Boolean(is_active))
    }

    if (!updates.length) return response.status(400).json({ error: 'No update fields provided' })
    updates.push('updated_at = now()')

    const result = await pool.query(
      `UPDATE public.rewards SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      values
    )
    return response.json({ reward: result.rows[0] })
  } catch (error) {
    if (error.code === '23505' && (error.constraint === 'rewards_single_active_offer_idx' || /rewards_single_active_offer/i.test(error.message || ''))) {
      return response.status(409).json({
        error: 'An active offer already exists for this business. Deactivate or delete the current offer before activating another offer.',
        code: 'ACTIVE_OFFER_EXISTS',
      })
    }
    return next(error)
  }
})

router.delete('/rewards/:rewardId', requireRoles(...managerRoles), async (request, response, next) => {
  try {
    if (!isUuid(request.params.rewardId)) return response.status(400).json({ error: 'Invalid reward identifier' })

    const rewResult = await pool.query(
      `SELECT r.id, r.program_id, p.business_id 
       FROM public.rewards r 
       JOIN public.loyalty_programs p ON p.id = r.program_id 
       WHERE r.id = $1`,
      [request.params.rewardId]
    )
    if (!rewResult.rowCount) return response.status(404).json({ error: 'Reward not found' })
    if (!request.businessIds.includes(rewResult.rows[0].business_id)) return response.status(403).json({ error: 'Reward access denied' })

    // Check if this reward has existing redemptions to preserve audit integrity
    const redemptions = await pool.query('SELECT count(*)::int as count FROM public.reward_redemptions WHERE reward_id = $1', [request.params.rewardId])
    const hasRedemptions = (redemptions.rows[0]?.count || 0) > 0

    if (hasRedemptions) {
      await pool.query('UPDATE public.rewards SET is_active = false, updated_at = now() WHERE id = $1', [request.params.rewardId])
      return response.json({ message: 'Reward deactivated to preserve redemption audit history', softDeleted: true, id: request.params.rewardId })
    } else {
      await pool.query('DELETE FROM public.rewards WHERE id = $1', [request.params.rewardId])
      return response.json({ message: 'Reward deleted successfully', deleted: true, id: request.params.rewardId })
    }
  } catch (error) {
    return next(error)
  }
})
router.post('/locations', requireRoles(...managerRoles), async (request, response, next) => insertTable(request, response, next, 'business_locations', ['business_id', 'name', 'address', 'is_active']))
router.post('/employees', requireRoles(...managerRoles), async (request, response, next) => {
  try {
    const { user_id: employeeUserId, business_id: businessId, role, permissions, location_ids: locationIds = [] } = request.body || {}
    if (!employeeUserId || !businessId || !['MANAGER', 'EMPLOYEE'].includes(role) || !Array.isArray(locationIds)) return response.status(400).json({ error: 'user_id, business_id, role, and location_ids are required' })
    if (!request.businessIds.includes(businessId)) return response.status(403).json({ error: 'Business access denied' })
    const employee = await createEmployee({ userId: employeeUserId, businessId, role, permissions, locationIds })
    return response.status(201).json({ data: employee })
  } catch (error) {
    return next(error)
  }
})

async function listTable(request, response, next, table, scopeColumn) {
  try {
    if (!request.businessIds?.length) return response.json({ data: [] })
    const safeSelects = {
      businesses: 'id, name, slug, logo_url, owner_user_id, created_at, updated_at',
      loyalty_programs: 'id, business_id, name, description, model, points_per_currency, currency_unit, is_active, created_at, updated_at',
      rewards: 'id, program_id, name, description, image_url, required_stamps, required_points, expires_at, is_active, created_at, updated_at',
      customer_memberships: 'id, customer_id, program_id, stamps_balance, points_balance, is_active, joined_at, updated_at',
      business_locations: 'id, business_id, name, address, is_active, created_at, updated_at',
      employees: 'id, user_id, business_id, role, permissions, is_active, created_at, updated_at',
    }
    let query = request.supabase.from(table).select(safeSelects[table] || '*').order('created_at', { ascending: false }).limit(100)
    if (table === 'businesses') query = query.in('id', request.businessIds)
    if (scopeColumn === 'business_id') query = query.in('business_id', request.businessIds)
    if (scopeColumn === 'program_id') {
      const { data: programs, error: programError } = await request.supabase.from('loyalty_programs').select('id').in('business_id', request.businessIds)
      if (programError) return next(programError)
      const programIds = programs.map((program) => program.id)
      if (!programIds.length) return response.json({ data: [] })
      query = query.in('program_id', programIds)
    }
    const { data, error } = await query
    if (error) return next(error)
    return response.json({ data })
  } catch (error) {
    return next(error)
  }
}

async function insertTable(request, response, next, table, allowedFields, requiredFields = {}) {
  try {
    const payload = { ...requiredFields, ...Object.fromEntries(allowedFields.filter((field) => request.body?.[field] !== undefined).map((field) => [field, request.body[field]])) }
    if (Object.keys(payload).length <= Object.keys(requiredFields).length) return response.status(400).json({ error: 'Request body is incomplete' })
    if (payload.business_id && !request.businessIds.includes(payload.business_id)) return response.status(403).json({ error: 'Business access denied' })

    if (table === 'rewards') {
      if (!payload.program_id || !isUuid(payload.program_id)) {
        return response.status(400).json({ error: 'A valid program_id is required', code: 'INVALID_PROGRAM_ID' })
      }
      const progRes = await pool.query('SELECT business_id, model FROM public.loyalty_programs WHERE id = $1', [payload.program_id])
      if (!progRes.rowCount) return response.status(404).json({ error: 'Program not found', code: 'PROGRAM_NOT_FOUND' })
      const program = progRes.rows[0]
      if (!request.businessIds.includes(program.business_id)) {
        return response.status(403).json({ error: 'Program access denied', code: 'PROGRAM_ACCESS_DENIED' })
      }
      if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
        return response.status(400).json({ error: 'Reward name is required', code: 'INVALID_REWARD_NAME' })
      }
      if (payload.is_active !== false) {
        const activeCheck = await pool.query(
          'SELECT id, name FROM public.rewards WHERE program_id = $1 AND is_active = true LIMIT 1',
          [payload.program_id]
        )
        if (activeCheck.rowCount > 0) {
          return response.status(409).json({
            error: 'An active offer already exists for this business. Deactivate or delete the current offer before creating a new active offer.',
            code: 'ACTIVE_OFFER_EXISTS',
            activeOffer: activeCheck.rows[0],
          })
        }
      }
      if (program.model === 'STAMPS') {
        const stamps = Number(payload.required_stamps)
        if (!Number.isInteger(stamps) || stamps <= 0) {
          return response.status(400).json({ error: 'Required stamps must be a positive whole number for stamps-based programs', code: 'INVALID_REQUIRED_STAMPS' })
        }
        payload.required_stamps = stamps
        payload.required_points = null
      } else if (program.model === 'POINTS') {
        const points = Number(payload.required_points)
        if (Number.isNaN(points) || points <= 0) {
          return response.status(400).json({ error: 'Required points must be greater than 0 for points-based programs', code: 'INVALID_REQUIRED_POINTS' })
        }
        payload.required_points = points
        payload.required_stamps = null
      }
    } else if (payload.program_id) {
      const { data: program, error: programError } = await request.supabase.from('loyalty_programs').select('business_id').eq('id', payload.program_id).maybeSingle()
      if (programError) return next(programError)
      if (!program || !request.businessIds.includes(program.business_id)) return response.status(403).json({ error: 'Program access denied' })
    }

    const { data, error } = await request.supabase.from(table).insert(payload).select().single()
    if (error) return next(error)
    return response.status(201).json({ data })
  } catch (error) {
    return next(error)
  }
}

function emptyStats() {
  return { customers: 0, issued: 0, redeemed: 0, activeRate: 0 }
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default router

