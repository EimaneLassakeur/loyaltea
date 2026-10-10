import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { config } from '../config.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { createAdminAuthClient, createAuthClient, createPublicClient, createUserClient } from '../supabase.js'
import { archiveBusiness, createBusinessProvisioning, createEmployee, createSubscriptionPlan, createWorkspace, earnLoyalty, finishBusinessProvisioning, getAccessibleBusinessIds, getBusinessPerformance, getBusinessStats, getPendingBusinessSubscription, getPlatformOverview, getSubscriptionPlans, redeemReward, updateBusinessLifecycle, updateSubscriptionPlan } from '../database.js'
import { expireSubscriptions, getBusinessSubscription, recordCashPaymentAndRenew, requireActiveBusinessSubscription, subscriptionAllowsAccess } from '../subscription.js'

const router = Router()
const staffRoles = ['BUSINESS_OWNER', 'MANAGER', 'EMPLOYEE', 'PLATFORM_ADMIN']
const managerRoles = ['BUSINESS_OWNER', 'MANAGER', 'PLATFORM_ADMIN']
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again later.' } })
const loyaltyLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many loyalty requests. Try again shortly.' } })

router.get('/health', (_request, response) => response.json({ ok: true }))

router.post('/auth/login', authLimiter, async (request, response, next) => {
  try {
    const { identifier, identifierType, password } = request.body || {}
    const normalizedEmail = normalizeEmail(identifierType === 'email' ? identifier : '')
    const normalizedPhone = normalizePhone(identifierType === 'phone' ? identifier : '')
    if ((!normalizedEmail && !normalizedPhone) || typeof password !== 'string' || password.length < 8) return response.status(400).json({ error: 'A valid email or phone number and a password of at least 8 characters are required' })
    const credentials = normalizedPhone ? { phone: normalizedPhone, password } : { email: normalizedEmail, password }
    const { data, error } = await createAuthClient().auth.signInWithPassword(credentials)
    if (error) return response.status(401).json({ error: error.message })
    return response.json({ session: data.session, user: data.user })
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
    if (!normalizedPhone || typeof password !== 'string' || typeof fullName !== 'string' || !fullName.trim() || password.length < 8) return response.status(400).json({ error: 'Phone number, full name, and a password of at least 8 characters are required' })
    if (email !== undefined && email !== null && email !== '' && !normalizedEmail) return response.status(400).json({ error: 'A valid email address is required when provided' })
    if (role !== 'CUSTOMER') return response.status(403).json({ error: 'Public signup is limited to customer accounts' })
    const { data, error } = await createAuthClient().auth.signUp({ phone: normalizedPhone, ...(normalizedEmail ? { email: normalizedEmail } : {}), password, options: { data: { full_name: fullName.trim(), role: 'CUSTOMER' }, emailRedirectTo: config.authRedirectUrl } })
    if (error) return response.status(400).json({ error: error.message })
    return response.status(201).json({ session: data.session, user: data.user, confirmationRequired: !data.session })
  } catch (error) {
    return next(error)
  }
})

router.post('/auth/refresh', authLimiter, async (request, response, next) => {
  try {
    const { refreshToken } = request.body || {}
    if (!refreshToken || typeof refreshToken !== 'string') return response.status(400).json({ error: 'refreshToken is required' })
    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session) return response.status(401).json({ error: 'Refresh token is invalid or expired' })
    return response.json({ session: data.session, user: data.user })
  } catch (error) {
    return next(error)
  }
})

router.post('/auth/logout', requireAuth, async (request, response, next) => {
  try {
    const { error } = await createUserClient(request.accessToken).auth.signOut()
    if (error && !/session not found|already signed out/i.test(error.message)) return next(error)
    return response.status(204).end()
  } catch (error) {
    return next(error)
  }
})

router.get('/public/programs/:programId', async (request, response, next) => {
  try {
    const { data, error } = await createPublicClient()
      .from('loyalty_programs')
      .select('id, name, description, model, currency_unit, business_id, businesses(id, name, slug, logo_url), rewards(id, name, description, image_url, required_stamps, required_points, expires_at, is_active)')
      .eq('id', request.params.programId)
      .eq('is_active', true)
      .maybeSingle()
    if (error) return next(error)
    if (!data) return response.status(404).json({ error: 'Program not found' })
    return response.json({ program: data })
  } catch (error) {
    return next(error)
  }
})

router.get('/public/businesses/:businessSlug', async (request, response, next) => {
  try {
    const { data, error } = await createPublicClient()
      .from('businesses')
      .select('id, name, slug, logo_url, loyalty_programs(id, name, description, model, currency_unit, is_active, rewards(id, name, description, image_url, required_stamps, required_points, expires_at, is_active))')
      .eq('slug', request.params.businessSlug)
      .maybeSingle()
    if (error) return next(error)
    const program = data?.loyalty_programs?.find((item) => item.is_active)
    if (!data || !program) return response.status(404).json({ error: 'Business or active loyalty program not found' })
    const subscription = await getBusinessSubscription(data.id)
    return response.json({ business: { id: data.id, name: data.name, slug: data.slug, logo_url: data.logo_url, status: data.status }, program: { ...program, business_id: data.id, businesses: { id: data.id, name: data.name, slug: data.slug, logo_url: data.logo_url } }, acceptingMemberships: data.status === 'active' && subscriptionAllowsAccess(subscription) })
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
  try { return response.json({ business: await updateBusinessLifecycle({ businessId: request.params.businessId, status: 'paused', actorUserId: request.user.id }) }) } catch (error) { return next(error) }
})
router.post('/admin/businesses/:businessId/resume', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try { return response.json({ business: await updateBusinessLifecycle({ businessId: request.params.businessId, status: 'active', actorUserId: request.user.id }) }) } catch (error) { return next(error) }
})
router.delete('/admin/businesses/:businessId', requireRoles('PLATFORM_ADMIN'), async (request, response, next) => {
  try { return response.json(await archiveBusiness({ businessId: request.params.businessId, actorUserId: request.user.id })) } catch (error) { return next(error) }
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

router.post('/businesses/onboard', requireRoles('BUSINESS_OWNER', 'PLATFORM_ADMIN'), async (request, response, next) => {
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
router.post('/businesses', requireRoles('BUSINESS_OWNER', 'PLATFORM_ADMIN'), async (request, response, next) => insertTable(request, response, next, 'businesses', ['name', 'slug', 'logo_url'], { owner_user_id: request.user.id }))

router.post('/public/programs/:programId/join', requireRoles('CUSTOMER'), async (request, response, next) => {
  try {
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
    const requestedBusinessId = request.query.businessId
    if (requestedBusinessId && !request.businessIds.includes(requestedBusinessId)) return response.status(403).json({ error: 'Business access denied' })
    if (!request.businessIds.length) return response.json({ business: null, program: null, customers: [], transactions: [], redemptions: [], stats: emptyStats(), performance: { period: 30, points: [] } })
    const selectedBusinessId = requestedBusinessId || request.activeBusinessIds?.[0] || request.businessIds[0]
    if (request.profile?.role !== 'PLATFORM_ADMIN' && !request.activeBusinessIds?.includes(selectedBusinessId)) return response.status(402).json({ error: 'The selected business subscription is inactive', code: 'SUBSCRIPTION_REQUIRED' })
    const { data: businesses, error: businessError } = await request.supabase
      .from('businesses')
      .select('id, name, logo_url, business_locations(id, name, is_active), loyalty_programs(id, name, model, is_active, rewards(id, name, description, required_stamps, required_points, expires_at, is_active))')
      .eq('id', selectedBusinessId)
      .order('created_at', { ascending: true })
      .limit(1)
    if (businessError) return next(businessError)
    const business = businesses?.[0]
    if (!business) return response.json({ business: null, program: null, customers: [], transactions: [], redemptions: [], stats: emptyStats() })

    const program = business.loyalty_programs?.find((item) => item.is_active) ?? business.loyalty_programs?.[0]
    if (!program) return response.json({ business, program: null, customers: [], transactions: [], redemptions: [], stats: emptyStats() })

    const [{ data: memberships, error: membershipError }, { data: transactions, error: transactionError }, { data: redemptions, error: redemptionError }] = await Promise.all([
      request.supabase.from('customer_memberships').select('id, customer_id, stamps_balance, points_balance, is_active, updated_at, customers(id, email)').eq('program_id', program.id).order('updated_at', { ascending: false }).limit(100),
      request.supabase.from('transactions').select('id, membership_id, type, stamps_delta, points_delta, created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(100),
      request.supabase.from('reward_redemptions').select('id, membership_id, reward_id, created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(100),
    ])
    if (membershipError) return next(membershipError)
    if (transactionError) return next(transactionError)
    if (redemptionError) return next(redemptionError)

    const customers = (memberships ?? []).map((membership) => ({
      id: membership.id,
      name: membership.customers?.email || 'Customer',
      email: membership.customers?.email || '',
      stamps: program.model === 'STAMPS' ? membership.stamps_balance : membership.points_balance,
      unit: program.model === 'STAMPS' ? 'stamps' : 'points',
      isActive: membership.is_active,
      updatedAt: membership.updated_at,
    }))
    const period = [30, 90, 365].includes(Number(request.query.period)) ? Number(request.query.period) : 30
    let stats
    let performance
    try {
      ;[stats, performance] = await Promise.all([getBusinessStats(business.id), getBusinessPerformance(business.id, period)])
    } catch (error) {
      error.status = error.status && error.status < 500 ? error.status : 500
      error.code = 'DASHBOARD_METRICS_QUERY_FAILED'
      error.message = `Dashboard metrics query failed: ${error.message}`
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
router.post('/programs', requireRoles(...managerRoles), async (request, response, next) => insertTable(request, response, next, 'loyalty_programs', ['business_id', 'name', 'description', 'model', 'points_per_currency', 'currency_unit', 'is_active']))
router.post('/rewards', requireRoles(...managerRoles), async (request, response, next) => insertTable(request, response, next, 'rewards', ['program_id', 'name', 'description', 'image_url', 'required_stamps', 'required_points', 'expires_at', 'is_active']))
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
    if (payload.program_id) {
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

function normalizeEmail(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}

function normalizePhone(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().replace(/[\s().-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : ''
}

function emptyStats() {
  return { customers: 0, issued: 0, redeemed: 0, activeRate: 0 }
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default router
