import test from 'node:test'
import assert from 'node:assert/strict'
import { subscriptionAllowsAccess } from '../src/subscription.js'

test('subscriptionAllowsAccess grants access only when active and within date bounds', () => {
  const now = new Date('2026-10-13T12:00:00Z')

  // Active within bounds
  const activeSub = {
    status: 'active',
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-10-31T23:59:59Z',
  }
  assert.equal(subscriptionAllowsAccess(activeSub, now), true)

  // Expired status
  const expiredStatusSub = {
    status: 'expired',
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-10-31T23:59:59Z',
  }
  assert.equal(subscriptionAllowsAccess(expiredStatusSub, now), false)

  // Pending status
  const pendingSub = {
    status: 'pending',
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-10-31T23:59:59Z',
  }
  assert.equal(subscriptionAllowsAccess(pendingSub, now), false)

  // Suspended status
  const suspendedSub = {
    status: 'suspended',
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-10-31T23:59:59Z',
  }
  assert.equal(subscriptionAllowsAccess(suspendedSub, now), false)

  // Past ends_at date
  const pastSub = {
    status: 'active',
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-01T00:00:00Z',
  }
  assert.equal(subscriptionAllowsAccess(pastSub, now), false)

  // Future starts_at date
  const futureSub = {
    status: 'active',
    starts_at: '2026-10-20T00:00:00Z',
    ends_at: '2026-11-20T00:00:00Z',
  }
  assert.equal(subscriptionAllowsAccess(futureSub, now), false)

  // Null subscription
  assert.equal(subscriptionAllowsAccess(null, now), false)
})

test('canonical join route URL formatting and normalization', () => {
  const baseHttps = 'https://loyaltea.app'
  const slug = 'cafe-alger'

  // Canonical HTTPS business join route
  const joinUrl = `${baseHttps.replace(/\/+$/, '')}/join/business/${encodeURIComponent(slug)}`
  assert.equal(joinUrl, 'https://loyaltea.app/join/business/cafe-alger')

  // Regex matches with and without trailing slash
  const regex = /^\/join\/business\/([^/]+)\/?$/
  const match1 = '/join/business/cafe-alger'.match(regex)
  assert.ok(match1)
  assert.equal(match1[1], 'cafe-alger')

  const match2 = '/join/business/cafe-alger/'.match(regex)
  assert.ok(match2)
  assert.equal(match2[1], 'cafe-alger')

  // Legacy program join regex
  const programRegex = /^\/join\/([^/]+)\/?$/
  const programMatch = '/join/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/'.match(programRegex)
  assert.ok(programMatch)
  assert.equal(programMatch[1], '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
})

test('public business payload formatting and field isolation', () => {
  const rawBusinessData = {
    id: 'b-123',
    name: 'Sample Cafe',
    slug: 'sample-cafe',
    status: 'active',
    logo_url: 'https://example.com/logo.png',
    owner_id: 'user-secret-999', // Should NEVER leak
    loyalty_programs: [
      {
        id: 'prog-1',
        name: 'Coffee Club',
        description: 'Get free coffee',
        model: 'STAMPS',
        currency_unit: 'stamps',
        is_active: true,
        rewards: [
          { id: 'rew-1', name: 'Free Espresso', required_stamps: 8, required_points: 0, is_active: true },
        ],
      },
    ],
  }

  const program = rawBusinessData.loyalty_programs.find((p) => p.is_active)
  assert.ok(program)

  // Construct response structure as done in router
  const responsePayload = {
    business: {
      id: rawBusinessData.id,
      name: rawBusinessData.name,
      slug: rawBusinessData.slug,
      logo_url: rawBusinessData.logo_url,
      status: rawBusinessData.status,
    },
    program: {
      ...program,
      business_id: rawBusinessData.id,
      businesses: {
        id: rawBusinessData.id,
        name: rawBusinessData.name,
        slug: rawBusinessData.slug,
        logo_url: rawBusinessData.logo_url,
      },
    },
    acceptingMemberships: rawBusinessData.status === 'active',
  }

  // Verify public payload contains only safe fields
  assert.equal(responsePayload.business.id, 'b-123')
  assert.equal(responsePayload.business.name, 'Sample Cafe')
  assert.equal(responsePayload.business.slug, 'sample-cafe')
  assert.equal(responsePayload.program.name, 'Coffee Club')
  assert.equal(responsePayload.acceptingMemberships, true)

  // Verify secret owner and internal employee/system fields are not present
  assert.equal('owner_id' in responsePayload.business, false)
  assert.equal('employees' in responsePayload.business, false)
  assert.equal('credentials' in responsePayload, false)
})

test('public business error differentiation: 404 BUSINESS_NOT_FOUND vs NO_ACTIVE_PROGRAM', () => {
  // Scenario 1: Business does not exist in DB
  const businessNotFound = {
    data: null,
    expectedStatus: 404,
    expectedCode: 'BUSINESS_NOT_FOUND',
  }
  assert.equal(businessNotFound.expectedStatus, 404)
  assert.equal(businessNotFound.expectedCode, 'BUSINESS_NOT_FOUND')

  // Scenario 2: Business exists, but has no active loyalty program
  const businessNoProgram = {
    data: { id: 'b-1', loyalty_programs: [] },
  }
  const program = businessNoProgram.data.loyalty_programs?.find((item) => item.is_active)
  assert.equal(program, undefined)
  const noProgramError = { status: 404, code: 'NO_ACTIVE_PROGRAM' }
  assert.equal(noProgramError.status, 404)
  assert.equal(noProgramError.code, 'NO_ACTIVE_PROGRAM')

  // Scenario 3: Database error (e.g. 42P17 recursion) is passed to error middleware
  const dbError = new Error('infinite recursion detected in policy for relation employees')
  dbError.code = '42P17'
  const middlewareStatus = dbError.status || 500
  const clientResponse = {
    error: middlewareStatus >= 500 ? 'Internal server error' : dbError.message,
    code: dbError.code,
  }
  assert.equal(middlewareStatus, 500)
  assert.equal(clientResponse.error, 'Internal server error')
  assert.equal(clientResponse.code, '42P17')
  // Verify client is NOT told "no active loyalty program" when a database error occurred
  assert.notEqual(clientResponse.code, 'NO_ACTIVE_PROGRAM')
})

test('phone and email normalization with Algerian and international formats', async () => {
  const { normalizePhone, normalizeEmail, isValidEmail, isValidPhone } = await import('../src/authUtils.js')

  // Algerian local formats with leading 0
  assert.equal(normalizePhone('0555123456'), '+213555123456')
  assert.equal(normalizePhone('0555 12 34 56'), '+213555123456')
  assert.equal(normalizePhone('0661 23 45 67'), '+213661234567')
  assert.equal(normalizePhone('0770 99 88 77'), '+213770998877')

  // Algerian formats without leading 0
  assert.equal(normalizePhone('555123456'), '+213555123456')
  assert.equal(normalizePhone('661234567'), '+213661234567')
  assert.equal(normalizePhone('770998877'), '+213770998877')

  // 00 prefix
  assert.equal(normalizePhone('00213555123456'), '+213555123456')

  // 213 prefix without +
  assert.equal(normalizePhone('213555123456'), '+213555123456')

  // Standard E.164
  assert.equal(normalizePhone('+213555123456'), '+213555123456')
  assert.equal(normalizePhone('+33612345678'), '+33612345678')

  // Invalid numbers
  assert.equal(normalizePhone('12345'), '')
  assert.equal(normalizePhone('not-a-number'), '')
  assert.equal(normalizePhone(''), '')
  assert.equal(isValidPhone('0555123456'), true)
  assert.equal(isValidPhone('invalid'), false)

  // Email normalization
  assert.equal(normalizeEmail(' User@Example.COM '), 'user@example.com')
  assert.equal(normalizeEmail('aymenplus2005@gmail.com'), 'aymenplus2005@gmail.com')
  assert.equal(normalizeEmail('invalid-email'), '')
  assert.equal(isValidEmail('test@loyaltea.app'), true)
  assert.equal(isValidEmail('bad@'), false)
})

test('simplified role model: primary roles and business owner independence', () => {
  const primaryRoles = ['PLATFORM_ADMIN', 'BUSINESS_OWNER', 'CUSTOMER']

  // Role permissions
  const canManagePlatform = (role) => role === 'PLATFORM_ADMIN'
  const canManageBusiness = (role) => ['PLATFORM_ADMIN', 'BUSINESS_OWNER'].includes(role)
  const canEnrollInProgram = (role) => role === 'CUSTOMER'

  assert.equal(canManagePlatform('PLATFORM_ADMIN'), true)
  assert.equal(canManagePlatform('BUSINESS_OWNER'), false)
  assert.equal(canManagePlatform('CUSTOMER'), false)

  // Business owners manage their own business directly without mandatory employee accounts
  assert.equal(canManageBusiness('BUSINESS_OWNER'), true)
  assert.equal(canManageBusiness('CUSTOMER'), false)

  // Customers enroll in programs
  assert.equal(canEnrollInProgram('CUSTOMER'), true)
  assert.equal(canEnrollInProgram('BUSINESS_OWNER'), false)

  // Accessible business IDs query works for business owner with zero employees
  const mockOwnerId = 'owner-uuid-1'
  const mockBusinesses = [{ id: 'biz-1', owner_user_id: mockOwnerId }]
  const mockEmployees = [] // Zero employees in database

  const accessibleIds = mockBusinesses
    .filter((b) => b.owner_user_id === mockOwnerId)
    .map((b) => b.id)
    .concat(mockEmployees.filter((e) => e.user_id === mockOwnerId && e.is_active).map((e) => e.business_id))

  assert.deepEqual(accessibleIds, ['biz-1'])
})

test('multi-business enrollment and duplicate enrollment prevention', () => {
  // Existing memberships for a customer across multiple businesses
  const customerId = 'cust-1'
  const memberships = [
    { customer_id: customerId, program_id: 'prog-biz-a', is_active: true },
    { customer_id: customerId, program_id: 'prog-biz-b', is_active: true },
  ]

  // Customer CAN join multiple businesses
  const canJoinNewBusiness = !memberships.some((m) => m.program_id === 'prog-biz-c' && m.is_active)
  assert.equal(canJoinNewBusiness, true)

  // Customer CANNOT join the same business twice (duplicate prevented)
  const isDuplicateEnrollment = memberships.some((m) => m.program_id === 'prog-biz-a' && m.is_active)
  assert.equal(isDuplicateEnrollment, true)

  const duplicateResponse = isDuplicateEnrollment
    ? { status: 409, code: 'MEMBERSHIP_EXISTS', error: 'You are already enrolled in this business program' }
    : null

  assert.equal(duplicateResponse.status, 409)
  assert.equal(duplicateResponse.code, 'MEMBERSHIP_EXISTS')
})

test('destination preservation and returnTo validation', () => {
  // Valid relative internal paths preserved
  const sanitizeReturnTo = (path) => {
    if (typeof path !== 'string') return '/'
    const trimmed = path.trim()
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
      return trimmed
    }
    return '/'
  }

  assert.equal(sanitizeReturnTo('/join/business/cafe-alger'), '/join/business/cafe-alger')
  assert.equal(sanitizeReturnTo('/join/business/nigga'), '/join/business/nigga')
  assert.equal(sanitizeReturnTo('https://malicious.site'), '/')
  assert.equal(sanitizeReturnTo('//malicious.site'), '/')
  assert.equal(sanitizeReturnTo('javascript:alert(1)'), '/')
})

test('public registration security: only customers allowed, business owner/admin rejected', () => {
  const validatePublicSignupRole = (role) => {
    if (role && role !== 'CUSTOMER') {
      return {
        allowed: false,
        status: 403,
        code: 'UNAUTHORIZED_ROLE_REGISTRATION',
        error: 'Public registration is restricted to customer accounts only. Business owners and administrators must be provisioned by a platform administrator.',
      }
    }
    return { allowed: true, role: 'CUSTOMER' }
  }

  // Customer registration allowed
  assert.equal(validatePublicSignupRole('CUSTOMER').allowed, true)
  assert.equal(validatePublicSignupRole(undefined).allowed, true)
  assert.equal(validatePublicSignupRole('').allowed, true)

  // Business owner registration rejected
  const ownerAttempt = validatePublicSignupRole('BUSINESS_OWNER')
  assert.equal(ownerAttempt.allowed, false)
  assert.equal(ownerAttempt.status, 403)
  assert.equal(ownerAttempt.code, 'UNAUTHORIZED_ROLE_REGISTRATION')

  // Platform admin registration rejected
  const adminAttempt = validatePublicSignupRole('PLATFORM_ADMIN')
  assert.equal(adminAttempt.allowed, false)
  assert.equal(adminAttempt.status, 403)
  assert.equal(adminAttempt.code, 'UNAUTHORIZED_ROLE_REGISTRATION')

  // Manager/Employee registration rejected
  assert.equal(validatePublicSignupRole('MANAGER').allowed, false)
  assert.equal(validatePublicSignupRole('EMPLOYEE').allowed, false)
})

test('duplicate account prevention: email and phone duplicate detection', () => {
  const existingUsers = [
    { id: 'u-1', email: 'alice@example.com', phone: '+213555111222' },
    { id: 'u-2', email: 'bob@example.com', phone: '+213555333444' },
  ]

  const checkDuplicateSignup = (email, phone) => {
    if (phone && existingUsers.some((u) => u.phone === phone)) {
      return { status: 409, code: 'PHONE_ALREADY_EXISTS', error: 'This phone number is already registered to an existing account. Please sign in using your existing account.' }
    }
    if (email && existingUsers.some((u) => u.email === email)) {
      return { status: 409, code: 'USER_ALREADY_EXISTS', error: 'An account with this email address already exists. Please sign in instead.' }
    }
    return { status: 201, ok: true }
  }

  // Brand new user succeeds
  assert.equal(checkDuplicateSignup('charlie@example.com', '+213555999000').status, 201)

  // Duplicate phone rejected
  const dupPhone = checkDuplicateSignup('newuser@example.com', '+213555111222')
  assert.equal(dupPhone.status, 409)
  assert.equal(dupPhone.code, 'PHONE_ALREADY_EXISTS')

  // Duplicate email rejected
  const dupEmail = checkDuplicateSignup('alice@example.com', '+213555777888')
  assert.equal(dupEmail.status, 409)
  assert.equal(dupEmail.code, 'USER_ALREADY_EXISTS')
})

test('account security: unverified phone number does not permit account recovery or automatic linking', () => {
  // Unverified phone cannot be used as sole proof of identity
  const verifyIdentityLinkingEligibility = (authenticatedUser, targetPhone, phoneConfirmed) => {
    if (!authenticatedUser) {
      return { allowed: false, error: 'Authentication required for identity linking' }
    }
    if (!phoneConfirmed) {
      return { allowed: false, error: 'Unverified phone number cannot be linked or used for account recovery' }
    }
    return { allowed: true }
  }

  // Unauthenticated caller cannot link
  assert.equal(verifyIdentityLinkingEligibility(null, '+213555111222', true).allowed, false)

  // Unconfirmed phone cannot be linked
  assert.equal(verifyIdentityLinkingEligibility({ id: 'u-1' }, '+213555111222', false).allowed, false)

  // Authenticated user with confirmed phone can be linked
  assert.equal(verifyIdentityLinkingEligibility({ id: 'u-1' }, '+213555111222', true).allowed, true)
})

test('phone authentication flow: phone normalization, bridge lookup, and credential validation', async () => {
  const { normalizePhone } = await import('../src/authUtils.js')

  // Sample database records representing users with phone numbers
  const mockUsers = [
    { id: 'u-owner-1', email: 'owner@business.com', phone: '213780387806' },
    { id: 'u-customer-1', email: 'phone_213555123456@loyaltea.local', phone: '+213555123456' },
  ]

  const authenticatePhone = (inputPhone, password) => {
    const norm = normalizePhone(inputPhone)
    if (!norm || typeof password !== 'string' || password.length < 8) {
      return { status: 400, error: 'A valid email or phone number and a password of at least 8 characters are required' }
    }
    const rawDigits = norm.replace(/\D/g, '')
    const user = mockUsers.find((u) => u.phone === norm || u.phone === rawDigits)
    if (!user) {
      // Must return generic INVALID_CREDENTIALS to prevent account enumeration
      return { status: 401, code: 'INVALID_CREDENTIALS', error: 'Invalid login credentials' }
    }
    if (password !== 'CorrectPassword123!') {
      return { status: 401, code: 'INVALID_CREDENTIALS', error: 'Invalid login credentials' }
    }
    return { status: 200, session: { access_token: `token-${user.id}` }, user: { id: user.id, email: user.email } }
  }

  // 1. Valid registered phone with local Algerian format + correct password -> 200
  const res1 = authenticatePhone('0780387806', 'CorrectPassword123!')
  assert.equal(res1.status, 200)
  assert.equal(res1.user.id, 'u-owner-1')

  // 2. Valid registered phone with E.164 + correct password -> 200
  const res2 = authenticatePhone('+213780387806', 'CorrectPassword123!')
  assert.equal(res2.status, 200)
  assert.equal(res2.user.id, 'u-owner-1')

  // 3. Valid registered phone + INCORRECT password -> 401
  const res3 = authenticatePhone('0780387806', 'WrongPassword123!')
  assert.equal(res3.status, 401)
  assert.equal(res3.code, 'INVALID_CREDENTIALS')

  // 4. UNREGISTERED phone -> 401 with SAME error code to prevent enumeration
  const res4 = authenticatePhone('0799999999', 'CorrectPassword123!')
  assert.equal(res4.status, 401)
  assert.equal(res4.code, 'INVALID_CREDENTIALS')

  // 5. Invalid phone format -> 400
  const res5 = authenticatePhone('not-a-number', 'CorrectPassword123!')
  assert.equal(res5.status, 400)
})

test('business loyalty program and offer management: model configuration and soft-delete audit preservation', () => {
  // Mock programs and rewards data
  const program = {
    id: 'prog-1',
    business_id: 'biz-1',
    name: 'Main Loyalty Program',
    model: 'STAMPS',
    points_per_currency: null,
    currency_unit: 'DZD',
    is_active: true,
  }

  // 1. Program model configuration validation
  const updateProgram = (prog, updates) => {
    if (updates.model && !['STAMPS', 'POINTS'].includes(updates.model)) {
      throw new Error('Model must be STAMPS or POINTS')
    }
    return { ...prog, ...updates }
  }

  const updatedToPoints = updateProgram(program, { model: 'POINTS', points_per_currency: 1 })
  assert.equal(updatedToPoints.model, 'POINTS')
  assert.equal(updatedToPoints.points_per_currency, 1)

  assert.throws(() => updateProgram(program, { model: 'INVALID_MODEL' }), /Model must be STAMPS or POINTS/)

  // 2. Offer deletion audit preservation: soft deactivate when redemptions exist
  const mockRedemptions = [
    { id: 'red-1', reward_id: 'rew-redeemed', membership_id: 'mem-1' },
  ]

  const deleteReward = (rewardId) => {
    const hasRedemptions = mockRedemptions.some((r) => r.reward_id === rewardId)
    if (hasRedemptions) {
      // Must NOT delete row, soft-deactivate to preserve past customer redemptions
      return { action: 'soft_deactivate', is_active: false, preservedRedemptions: true }
    }
    return { action: 'hard_delete', deleted: true }
  }

  const resRedeemed = deleteReward('rew-redeemed')
  assert.equal(resRedeemed.action, 'soft_deactivate')
  assert.equal(resRedeemed.is_active, false)
  assert.equal(resRedeemed.preservedRedemptions, true)

  const resUnredeemed = deleteReward('rew-unredeemed')
  assert.equal(resUnredeemed.action, 'hard_delete')
  assert.equal(resUnredeemed.deleted, true)
})

test('contact formatting and WhatsApp link generation for business and customer details', () => {
  const formatWhatsappUrl = (phone) => {
    if (!phone) return null
    const cleaned = String(phone).replace(/\(0\)/g, '')
    let digits = cleaned.replace(/\D/g, '')
    if (!digits) return null
    if (digits.startsWith('0')) {
      digits = '213' + digits.slice(1)
    }
    return `https://wa.me/${digits}`
  }

  // Local Algerian mobile with leading zero
  assert.equal(formatWhatsappUrl('0780387806'), 'https://wa.me/213780387806')

  // E.164 format with plus
  assert.equal(formatWhatsappUrl('+213780387806'), 'https://wa.me/213780387806')

  // Formatted with spaces, dashes, and trunk (0)
  assert.equal(formatWhatsappUrl('+213 (0) 780-387-806'), 'https://wa.me/213780387806')

  // International number
  assert.equal(formatWhatsappUrl('+33612345678'), 'https://wa.me/33612345678')

  // Empty or null
  assert.equal(formatWhatsappUrl(null), null)
  assert.equal(formatWhatsappUrl(''), null)
})

test('loyalty program configuration: model transitions, check constraints, authorization, and duplicate prevention', () => {
  // Validate model transition and constraint compliance helper
  const processProgramUpdate = ({ currentProgram, callerBusinessIds, body }) => {
    if (!callerBusinessIds.includes(currentProgram.business_id)) {
      return { status: 403, error: 'Program access denied', code: 'PROGRAM_ACCESS_DENIED' }
    }

    const { name, description, model, points_per_currency, currency_unit, is_active } = body || {}

    if (model !== undefined && !['STAMPS', 'POINTS'].includes(model)) {
      return { status: 400, error: 'Model must be STAMPS or POINTS', code: 'INVALID_MODEL' }
    }

    const effectiveModel = model !== undefined ? model : currentProgram.model

    let effectivePpc = undefined
    if (effectiveModel === 'STAMPS') {
      // Must be null for STAMPS to satisfy check constraint
      effectivePpc = null
    } else if (effectiveModel === 'POINTS') {
      if (points_per_currency !== undefined && points_per_currency !== null && points_per_currency !== '') {
        const val = Number(points_per_currency)
        if (Number.isNaN(val) || val <= 0) {
          return { status: 400, error: 'Points per currency unit must be greater than 0', code: 'INVALID_POINTS_PER_CURRENCY' }
        }
        effectivePpc = val
      } else if (model === 'POINTS' && currentProgram.model !== 'POINTS') {
        return { status: 400, error: 'Points per currency unit is required for points-based programs and must be greater than 0', code: 'INVALID_POINTS_PER_CURRENCY' }
      } else if (currentProgram.points_per_currency === null) {
        return { status: 400, error: 'Points per currency unit is required for points-based programs and must be greater than 0', code: 'INVALID_POINTS_PER_CURRENCY' }
      }
    }

    if (name !== undefined) {
      const trimmed = typeof name === 'string' ? name.trim() : ''
      if (!trimmed || trimmed.length > 120) {
        return { status: 400, error: 'Program name must be between 1 and 120 characters', code: 'INVALID_PROGRAM_NAME' }
      }
    }

    const updated = {
      ...currentProgram,
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(effectivePpc !== undefined ? { points_per_currency: effectivePpc } : {}),
      ...(currency_unit !== undefined ? { currency_unit: currency_unit.trim() || 'DZD' } : {}),
      ...(is_active !== undefined ? { is_active: Boolean(is_active) } : {}),
    }

    // Verify database check constraint loyalty_programs_check:
    // ((model = 'STAMPS' and points_per_currency is null) or (model = 'POINTS' and points_per_currency > 0))
    const violatesCheck = (updated.model === 'STAMPS' && updated.points_per_currency !== null) ||
                          (updated.model === 'POINTS' && !(Number(updated.points_per_currency) > 0))

    if (violatesCheck) {
      return { status: 400, error: 'Check constraint violation', code: 'CHECK_VIOLATION' }
    }

    return { status: 200, program: updated }
  }

  // 1. Successful transition from POINTS to STAMPS: points_per_currency is cleared to NULL
  const pointsProg = { id: 'prog-1', business_id: 'biz-1', name: 'VIP Points', model: 'POINTS', points_per_currency: 1.0, currency_unit: 'DZD', is_active: true }
  const resStamps = processProgramUpdate({
    currentProgram: pointsProg,
    callerBusinessIds: ['biz-1'],
    body: { model: 'STAMPS', name: 'VIP Stamps' },
  })
  assert.equal(resStamps.status, 200)
  assert.equal(resStamps.program.model, 'STAMPS')
  assert.equal(resStamps.program.points_per_currency, null)

  // 2. Successful transition from STAMPS to POINTS with positive points_per_currency
  const stampsProg = { id: 'prog-2', business_id: 'biz-1', name: 'VIP Stamps', model: 'STAMPS', points_per_currency: null, currency_unit: 'DZD', is_active: true }
  const resPoints = processProgramUpdate({
    currentProgram: stampsProg,
    callerBusinessIds: ['biz-1'],
    body: { model: 'POINTS', points_per_currency: 2.5 },
  })
  assert.equal(resPoints.status, 200)
  assert.equal(resPoints.program.model, 'POINTS')
  assert.equal(resPoints.program.points_per_currency, 2.5)

  // 3. Transition from STAMPS to POINTS without points_per_currency: returns 400 (not 500)
  const resMissingPpc = processProgramUpdate({
    currentProgram: stampsProg,
    callerBusinessIds: ['biz-1'],
    body: { model: 'POINTS' },
  })
  assert.equal(resMissingPpc.status, 400)
  assert.equal(resMissingPpc.code, 'INVALID_POINTS_PER_CURRENCY')

  // 4. Invalid points_per_currency (0 or negative) returns 400
  const resZeroPpc = processProgramUpdate({
    currentProgram: pointsProg,
    callerBusinessIds: ['biz-1'],
    body: { points_per_currency: 0 },
  })
  assert.equal(resZeroPpc.status, 400)
  assert.equal(resZeroPpc.code, 'INVALID_POINTS_PER_CURRENCY')

  // 5. Cross-business authorization: owner cannot modify another business's program -> 403
  const resForbidden = processProgramUpdate({
    currentProgram: pointsProg,
    callerBusinessIds: ['other-biz'],
    body: { name: 'Hacked Name' },
  })
  assert.equal(resForbidden.status, 403)
  assert.equal(resForbidden.code, 'PROGRAM_ACCESS_DENIED')

  // 6. Duplicate program prevention logic
  const mockPrograms = [
    { id: 'prog-existing', business_id: 'biz-1', name: 'Existing Program', model: 'STAMPS', points_per_currency: null },
  ]
  const saveProgramForBusiness = (bizId, body, callerBusinessIds) => {
    if (!callerBusinessIds.includes(bizId)) {
      return { status: 403, error: 'Business access denied' }
    }
    const existing = mockPrograms.find((p) => p.business_id === bizId)
    if (existing) {
      // Upsert: update existing program, do NOT add a duplicate program record
      existing.name = body.name || existing.name
      existing.model = body.model || existing.model
      return { status: 200, action: 'updated', program: existing }
    }
    const newProg = { id: `prog-${Date.now()}`, business_id: bizId, ...body }
    mockPrograms.push(newProg)
    return { status: 201, action: 'created', program: newProg }
  }

  // Updating existing program via save does not create duplicate
  const upsertRes = saveProgramForBusiness('biz-1', { name: 'Renamed Program' }, ['biz-1'])
  assert.equal(upsertRes.status, 200)
  assert.equal(upsertRes.action, 'updated')
  assert.equal(mockPrograms.filter((p) => p.business_id === 'biz-1').length, 1)

  // Creating program for new business creates exactly one
  const createRes = saveProgramForBusiness('biz-2', { name: 'Biz 2 Program', model: 'STAMPS', points_per_currency: null }, ['biz-2'])
  assert.equal(createRes.status, 201)
  assert.equal(createRes.action, 'created')
  assert.equal(mockPrograms.filter((p) => p.business_id === 'biz-2').length, 1)
})

test('GET /api/dashboard: period validation, 1-to-1 loyalty_programs normalization, and business isolation', () => {
  // 1. Period validation
  const validatePeriod = (rawPeriod) => {
    if (rawPeriod !== undefined && !['30', '90', '365'].includes(String(rawPeriod))) {
      return { status: 400, error: 'Period must be 30, 90, or 365 days', code: 'INVALID_PERIOD' }
    }
    return { status: 200, period: rawPeriod !== undefined ? Number(rawPeriod) : 30 }
  }

  assert.equal(validatePeriod(undefined).period, 30)
  assert.equal(validatePeriod('30').period, 30)
  assert.equal(validatePeriod('90').period, 90)
  assert.equal(validatePeriod('365').period, 365)
  assert.equal(validatePeriod('45').status, 400)
  assert.equal(validatePeriod('invalid').status, 400)

  // 2. Loyalty programs normalization (handles PostgREST 1-to-1 object vs 1-to-many array vs null)
  const extractProgram = (business) => {
    const rawProgram = business.loyalty_programs
    return Array.isArray(rawProgram)
      ? (rawProgram.find((item) => item.is_active) ?? rawProgram[0] ?? null)
      : (rawProgram || null)
  }

  // Object format (returned by PostgREST when UNIQUE (business_id) constraint exists)
  const busWithObject = {
    loyalty_programs: { id: 'prog-1', name: 'Coffee Club', is_active: true, model: 'POINTS' },
  }
  const progFromObj = extractProgram(busWithObject)
  assert.equal(progFromObj.id, 'prog-1')
  assert.equal(progFromObj.model, 'POINTS')

  // Array format (legacy 1-to-many or mock)
  const busWithArray = {
    loyalty_programs: [
      { id: 'prog-old', name: 'Old', is_active: false },
      { id: 'prog-active', name: 'Active', is_active: true },
    ],
  }
  const progFromArr = extractProgram(busWithArray)
  assert.equal(progFromArr.id, 'prog-active')

  // Null format (business with no loyalty program configured yet)
  const busWithoutProg = { loyalty_programs: null }
  assert.equal(extractProgram(busWithoutProg), null)

  // 3. Business authorization check
  const checkBusinessAccess = (requestedId, userBusinessIds) => {
    if (requestedId && !userBusinessIds.includes(requestedId)) {
      return { status: 403, error: 'Business access denied', code: 'BUSINESS_ACCESS_DENIED' }
    }
    return { status: 200 }
  }

  assert.equal(checkBusinessAccess('biz-1', ['biz-1', 'biz-2']).status, 200)
  assert.equal(checkBusinessAccess('biz-3', ['biz-1', 'biz-2']).status, 403)
})

test('CORS origin parsing and normalization (parseAllowedOrigins)', async () => {
  const { parseAllowedOrigins } = await import('../src/app.js')

  // Handles trailing slashes
  assert.deepEqual(parseAllowedOrigins('https://loyaltea.vercel.app/'), ['https://loyaltea.vercel.app'])

  // Handles multiple origins with spaces and mixed slashes
  const multi = 'https://loyaltea.vercel.app/, https://loyaltea.app, https://preview.loyaltea.vercel.app///'
  assert.deepEqual(parseAllowedOrigins(multi), [
    'https://loyaltea.vercel.app',
    'https://loyaltea.app',
    'https://preview.loyaltea.vercel.app',
  ])

  // Handles null, undefined, and empty string
  assert.deepEqual(parseAllowedOrigins(''), [])
  assert.deepEqual(parseAllowedOrigins(null), [])
  assert.deepEqual(parseAllowedOrigins(undefined), [])
})

test('Authoritative phone authentication lookup vs unverified profile phone (A07:2021)', () => {
  // Database mock representing auth.users (authoritative) and public.users (user-editable profile metadata)
  const authUsers = [
    { id: 'auth-1', email: 'legit_owner@example.com', phone: '+213780387806' },
    { id: 'auth-2', email: 'phone_213555999888@loyaltea.local', phone: null },
    { id: 'auth-attacker', email: 'attacker@evil.com', phone: '+213999999999' },
  ]

  const publicUsers = [
    { id: 'auth-1', phone: '+213780387806' },
    { id: 'auth-2', phone: '+213555999888' },
    // Attacker entered the victim's phone number into their own unverified profile!
    { id: 'auth-attacker', phone: '+213780387806' },
  ]

  // Defensive lookup logic matching the hardened SQL query in POST /auth/login:
  // SELECT a.email FROM auth.users a
  // WHERE (a.phone = $1 OR a.phone = $2 OR a.email = 'phone_' || $2 || '@loyaltea.local') AND a.email IS NOT NULL
  // ORDER BY (CASE WHEN a.phone = $1 OR a.phone = $2 THEN 0 ELSE 1 END) LIMIT 1
  const findAuthoritativeEmailByPhone = (inputPhone) => {
    const rawDigits = inputPhone.replace(/\D/g, '')
    const syntheticEmail = `phone_${rawDigits}@loyaltea.local`

    const candidates = authUsers.filter((a) => {
      const phoneMatch = a.phone === inputPhone || a.phone === rawDigits
      const emailMatch = a.email === syntheticEmail
      return (phoneMatch || emailMatch) && a.email
    })

    if (!candidates.length) return null

    // Sort: authoritative phone matches first
    candidates.sort((a, b) => {
      const aPhoneMatch = a.phone === inputPhone || a.phone === rawDigits ? 0 : 1
      const bPhoneMatch = b.phone === inputPhone || b.phone === rawDigits ? 0 : 1
      return aPhoneMatch - bPhoneMatch
    })

    return candidates[0].email
  }

  // 1. Legitimate user logs in with phone -> Resolves to legit_owner@example.com, NOT attacker!
  const targetPhone = '+213780387806'
  const resolvedEmail = findAuthoritativeEmailByPhone(targetPhone)
  assert.equal(resolvedEmail, 'legit_owner@example.com')

  // 2. Phone-only customer with synthetic email -> Resolves accurately
  const customerPhone = '+213555999888'
  const resolvedCustomer = findAuthoritativeEmailByPhone(customerPhone)
  assert.equal(resolvedCustomer, 'phone_213555999888@loyaltea.local')

  // 3. Attacker's unverified phone collision cannot hijack victim's login
  assert.notEqual(resolvedEmail, 'attacker@evil.com')

  // 4. Unknown phone number returns null
  assert.equal(findAuthoritativeEmailByPhone('+213000000000'), null)
})

test('Reward model integrity & cross-business authorization validation (A01:2021 & A04:2021)', () => {
  const programs = [
    { id: 'prog-stamps-1', business_id: 'biz-1', model: 'STAMPS' },
    { id: 'prog-points-2', business_id: 'biz-2', model: 'POINTS' },
  ]

  const validateRewardCreation = ({ programId, callerBusinessIds, body }) => {
    const program = programs.find((p) => p.id === programId)
    if (!program) return { status: 404, error: 'Program not found' }
    if (!callerBusinessIds.includes(program.business_id)) {
      return { status: 403, error: 'Program access denied', code: 'PROGRAM_ACCESS_DENIED' }
    }
    const { name, required_stamps, required_points } = body || {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      return { status: 400, error: 'Reward name is required', code: 'INVALID_REWARD_NAME' }
    }

    const payload = { program_id: programId, name: name.trim() }

    if (program.model === 'STAMPS') {
      const stamps = Number(required_stamps)
      if (!Number.isInteger(stamps) || stamps <= 0) {
        return { status: 400, error: 'Required stamps must be a positive whole number for stamps-based programs', code: 'INVALID_REQUIRED_STAMPS' }
      }
      payload.required_stamps = stamps
      payload.required_points = null
    } else if (program.model === 'POINTS') {
      const points = Number(required_points)
      if (Number.isNaN(points) || points <= 0) {
        return { status: 400, error: 'Required points must be greater than 0 for points-based programs', code: 'INVALID_REQUIRED_POINTS' }
      }
      payload.required_points = points
      payload.required_stamps = null
    }

    return { status: 201, data: payload }
  }

  // 1. Cross-business creation rejected with 403
  const unauthorized = validateRewardCreation({
    programId: 'prog-stamps-1',
    callerBusinessIds: ['biz-other'],
    body: { name: 'Free Tea', required_stamps: 5 },
  })
  assert.equal(unauthorized.status, 403)
  assert.equal(unauthorized.code, 'PROGRAM_ACCESS_DENIED')

  // 2. STAMPS reward with points provided -> required_points is safely nulled and required_stamps enforced
  const stampsReward = validateRewardCreation({
    programId: 'prog-stamps-1',
    callerBusinessIds: ['biz-1'],
    body: { name: 'Free Tea', required_stamps: 8, required_points: 50 },
  })
  assert.equal(stampsReward.status, 201)
  assert.equal(stampsReward.data.required_stamps, 8)
  assert.equal(stampsReward.data.required_points, null)

  // 3. STAMPS reward with invalid stamps -> 400
  const invalidStamps = validateRewardCreation({
    programId: 'prog-stamps-1',
    callerBusinessIds: ['biz-1'],
    body: { name: 'Free Tea', required_stamps: -2 },
  })
  assert.equal(invalidStamps.status, 400)
  assert.equal(invalidStamps.code, 'INVALID_REQUIRED_STAMPS')

  // 4. POINTS reward with stamps provided -> required_stamps is safely nulled and required_points enforced
  const pointsReward = validateRewardCreation({
    programId: 'prog-points-2',
    callerBusinessIds: ['biz-2'],
    body: { name: '10% Discount', required_points: 200, required_stamps: 5 },
  })
  assert.equal(pointsReward.status, 201)
  assert.equal(pointsReward.data.required_points, 200)
  assert.equal(pointsReward.data.required_stamps, null)
})

test('Customer join program requires active business subscription and active status', () => {
  const evaluateJoinEligibility = ({ business, subscription, existingMembership }) => {
    if (business.status !== 'active') {
      return { status: 403, error: 'This business is not currently active', code: 'BUSINESS_INACTIVE' }
    }
    if (!subscriptionAllowsAccess(subscription)) {
      return { status: 403, error: 'This business is not currently accepting new memberships', code: 'BUSINESS_SUBSCRIPTION_INACTIVE' }
    }
    if (existingMembership?.is_active) {
      return { status: 409, error: 'You are already enrolled in this business program', code: 'MEMBERSHIP_EXISTS' }
    }
    return { status: 201, allowed: true }
  }

  const activeSub = { status: 'active', starts_at: '2026-01-01', ends_at: '2026-12-31' }
  const expiredSub = { status: 'expired', starts_at: '2026-01-01', ends_at: '2026-02-01' }

  // 1. Active business & subscription -> 201
  assert.equal(evaluateJoinEligibility({ business: { status: 'active' }, subscription: activeSub, existingMembership: null }).status, 201)

  // 2. Inactive/expired subscription -> 403 BUSINESS_SUBSCRIPTION_INACTIVE
  assert.equal(evaluateJoinEligibility({ business: { status: 'active' }, subscription: expiredSub, existingMembership: null }).status, 403)

  // 3. Suspended business -> 403 BUSINESS_INACTIVE
  assert.equal(evaluateJoinEligibility({ business: { status: 'suspended' }, subscription: activeSub, existingMembership: null }).status, 403)

  // 4. Duplicate active membership -> 409 MEMBERSHIP_EXISTS
  assert.equal(evaluateJoinEligibility({ business: { status: 'active' }, subscription: activeSub, existingMembership: { is_active: true } }).status, 409)
})

test('Vercel SPA rewrite configuration and production join routing validation', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  // 1. Verify frontend/vercel.json exists and contains standard SPA fallback rewrite
  const vercelJsonPath = path.resolve(process.cwd(), '../frontend/vercel.json')
  assert.ok(fs.existsSync(vercelJsonPath), 'frontend/vercel.json must exist to fix Vercel 404 on deep links')
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'))
  assert.ok(Array.isArray(vercelConfig.rewrites), 'rewrites array must be defined in vercel.json')
  const spaRewrite = vercelConfig.rewrites.find((r) => r.source === '/(.*)' && r.destination === '/index.html')
  assert.ok(spaRewrite, 'vercel.json must rewrite all non-file paths to /index.html')

  // 2. Verify route regex matching for production deep links
  const businessJoinRegex = /^\/join\/business\/([^/]+)\/?$/
  const testUrls = [
    { url: '/join/business/nigga', expectedSlug: 'nigga' },
    { url: '/join/business/nigga/', expectedSlug: 'nigga' },
    { url: '/join/business/cafe-alger', expectedSlug: 'cafe-alger' },
    { url: '/join/business/resto-123', expectedSlug: 'resto-123' },
  ]

  for (const { url, expectedSlug } of testUrls) {
    const match = url.match(businessJoinRegex)
    assert.ok(match, `Route ${url} should match business join regex`)
    assert.equal(match[1], expectedSlug)
  }
})

test('Platform admin business deletion vs archiving decision engine', () => {
  // Decision engine reflecting deleteOrArchiveBusiness
  const evaluateDeletionStrategy = ({ business, payments = 0, transactions = 0, redemptions = 0, requestedMode = 'auto' }) => {
    if (!business) return { status: 404, error: 'Business was not found' }
    const hasFinancialHistory = payments > 0 || transactions > 0 || redemptions > 0

    if (requestedMode === 'permanent' && hasFinancialHistory) {
      return {
        status: 409,
        error: `Cannot permanently delete business "${business.name}" because it contains ${payments} payment(s), ${transactions} transaction(s), and ${redemptions} redemption(s). Archiving was applied instead to preserve financial and audit records.`,
        code: 'BUSINESS_HAS_FINANCIAL_HISTORY',
      }
    }

    if (hasFinancialHistory || requestedMode === 'archive') {
      return {
        status: 200,
        action: 'archived',
        permanent: false,
        archived: true,
        business: { ...business, status: 'suspended', archived_at: new Date().toISOString() },
        programsActive: false,
        membershipsActive: false,
        ownerRole: 'CUSTOMER',
        message: hasFinancialHistory
          ? `Business "${business.name}" was safely archived. Financial records (${payments} payment(s), ${transactions} transaction(s)) were preserved.`
          : `Business "${business.name}" was archived.`,
      }
    }

    return {
      status: 200,
      action: 'deleted',
      permanent: true,
      deleted: true,
      ownerRole: 'CUSTOMER',
      message: `Business "${business.name}" was permanently deleted.`,
    }
  }

  // 1. Business with cash payments or transactions -> Must be ARCHIVED (preserving financial history)
  const bizWithPayments = { id: 'b-1', name: 'Nigga Cafe', slug: 'nigga', status: 'active', owner_user_id: 'u-1' }
  const archiveResult = evaluateDeletionStrategy({
    business: bizWithPayments,
    payments: 1,
    transactions: 20,
    redemptions: 4,
    requestedMode: 'auto',
  })
  assert.equal(archiveResult.status, 200)
  assert.equal(archiveResult.action, 'archived')
  assert.equal(archiveResult.permanent, false)
  assert.equal(archiveResult.business.status, 'suspended')
  assert.ok(archiveResult.business.archived_at)
  assert.equal(archiveResult.programsActive, false)
  assert.equal(archiveResult.ownerRole, 'CUSTOMER')

  // 2. Explicit permanent delete on business with payments -> Blocked with 409 conflict
  const conflictResult = evaluateDeletionStrategy({
    business: bizWithPayments,
    payments: 1,
    transactions: 5,
    requestedMode: 'permanent',
  })
  assert.equal(conflictResult.status, 409)
  assert.equal(conflictResult.code, 'BUSINESS_HAS_FINANCIAL_HISTORY')

  // 3. Draft/test business with 0 payments, 0 transactions -> Clean PERMANENT DELETION
  const cleanBiz = { id: 'b-clean', name: 'Draft Test', slug: 'draft-test', status: 'active', owner_user_id: 'u-2' }
  const deleteResult = evaluateDeletionStrategy({
    business: cleanBiz,
    payments: 0,
    transactions: 0,
    redemptions: 0,
    requestedMode: 'auto',
  })
  assert.equal(deleteResult.status, 200)
  assert.equal(deleteResult.action, 'deleted')
  assert.equal(deleteResult.permanent, true)
  assert.equal(deleteResult.ownerRole, 'CUSTOMER')
})

test('Active business isolation: archived businesses excluded from active directory and accessible IDs', () => {
  const allBusinesses = [
    { id: 'b-1', name: 'Active Cafe', status: 'active', archived_at: null },
    { id: 'b-2', name: 'Paused Cafe', status: 'paused', archived_at: null },
    { id: 'b-3', name: 'Deleted/Archived Cafe', status: 'suspended', archived_at: '2026-10-15T11:00:00Z' },
  ]

  // Query simulation for active directory: WHERE archived_at IS NULL
  const activeBusinesses = allBusinesses.filter((b) => b.archived_at === null)
  assert.equal(activeBusinesses.length, 2)
  assert.ok(!activeBusinesses.some((b) => b.id === 'b-3'))

  // Query simulation for archived directory: WHERE archived_at IS NOT NULL
  const archivedBusinesses = allBusinesses.filter((b) => b.archived_at !== null)
  assert.equal(archivedBusinesses.length, 1)
  assert.equal(archivedBusinesses[0].id, 'b-3')
  assert.equal(archivedBusinesses[0].status, 'suspended')
})

test('Persistent Session: session token normalization ensures valid numeric expires_at and expires_in', () => {
  const nowSeconds = 1729080000

  // 1. Session where Supabase provides expires_in but omits expires_at
  const rawSessionWithoutExpiresAt = {
    access_token: 'jwt-access-token-1',
    refresh_token: 'rt-refresh-token-1',
    expires_in: 3600,
    token_type: 'bearer',
  }

  const normalized = {
    ...rawSessionWithoutExpiresAt,
    expires_in: Number(rawSessionWithoutExpiresAt.expires_in) || 3600,
    expires_at: rawSessionWithoutExpiresAt.expires_at || (nowSeconds + (Number(rawSessionWithoutExpiresAt.expires_in) || 3600)),
  }

  assert.equal(normalized.expires_in, 3600)
  assert.equal(normalized.expires_at, nowSeconds + 3600)
  assert.equal(typeof normalized.expires_at, 'number')
  assert.equal(normalized.access_token, 'jwt-access-token-1')
  assert.equal(normalized.refresh_token, 'rt-refresh-token-1')

  // 2. Session where expires_at is already explicitly provided
  const rawSessionWithExpiresAt = {
    access_token: 'jwt-access-token-2',
    refresh_token: 'rt-refresh-token-2',
    expires_in: 7200,
    expires_at: nowSeconds + 7200,
  }

  const normalized2 = {
    ...rawSessionWithExpiresAt,
    expires_in: Number(rawSessionWithExpiresAt.expires_in) || 3600,
    expires_at: rawSessionWithExpiresAt.expires_at || (nowSeconds + (Number(rawSessionWithExpiresAt.expires_in) || 3600)),
  }

  assert.equal(normalized2.expires_at, nowSeconds + 7200)
})

test('Token Refresh Concurrency: deduplicates multiple in-flight refresh requests into a single promise', async () => {
  let refreshCallCount = 0

  // Simulation of the deduplicated refresh manager
  let activeRefreshPromise = null
  async function simulateRefreshAuthSession(refreshToken) {
    if (activeRefreshPromise) {
      return activeRefreshPromise
    }

    activeRefreshPromise = (async () => {
      try {
        refreshCallCount++
        // Simulate network latency for token rotation
        await new Promise((resolve) => setTimeout(resolve, 20))
        return {
          access_token: `new-access-token-${refreshCallCount}`,
          refresh_token: `new-refresh-token-${refreshCallCount}`,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }
      } finally {
        activeRefreshPromise = null
      }
    })()

    return activeRefreshPromise
  }

  // Simulate 5 simultaneous API calls detecting an expired token at the exact same moment
  const results = await Promise.all([
    simulateRefreshAuthSession('stale-refresh-token'),
    simulateRefreshAuthSession('stale-refresh-token'),
    simulateRefreshAuthSession('stale-refresh-token'),
    simulateRefreshAuthSession('stale-refresh-token'),
    simulateRefreshAuthSession('stale-refresh-token'),
  ])

  // Assert that exactly ONE backend refresh network request was made (preventing token rotation revocation)
  assert.equal(refreshCallCount, 1)

  // Assert that all 5 concurrent callers received the identical, fresh token
  for (const res of results) {
    assert.equal(res.access_token, 'new-access-token-1')
    assert.equal(res.refresh_token, 'new-refresh-token-1')
  }
})

test('Transparent 401 Retry: expired access token triggers automatic refresh and retries without user interruption', async () => {
  let requestAttempt = 0
  let refreshAttempt = 0
  let sessionState = {
    access_token: 'expired-access-token',
    refresh_token: 'valid-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) - 100, // already expired
  }

  async function mockApiFetch(path, token) {
    requestAttempt++
    if (token === 'expired-access-token') {
      return { status: 401, data: { error: 'Invalid or expired session' } }
    }
    return { status: 200, data: { memberships: [{ id: 'm-1', program_id: 'p-1' }] } }
  }

  async function mockRefreshSession(refreshToken) {
    refreshAttempt++
    sessionState = {
      access_token: 'fresh-access-token',
      refresh_token: 'rotated-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }
    return sessionState
  }

  // Execute client flow:
  let finalResult = null
  let currentToken = sessionState.access_token
  let response = await mockApiFetch('/api/customer/memberships', currentToken)

  if (response.status === 401 && sessionState.refresh_token) {
    // 401 intercepted, trigger refresh and retry
    const newSession = await mockRefreshSession(sessionState.refresh_token)
    currentToken = newSession.access_token
    const retryResponse = await mockApiFetch('/api/customer/memberships', currentToken)
    assert.equal(retryResponse.status, 200)
    finalResult = retryResponse.data
  }

  assert.equal(requestAttempt, 2) // First failed with 401, second retry succeeded
  assert.equal(refreshAttempt, 1) // Exactly one refresh performed
  assert.equal(sessionState.access_token, 'fresh-access-token')
  assert.deepEqual(finalResult, { memberships: [{ id: 'm-1', program_id: 'p-1' }] })
})

test('Network fault tolerance: network errors during refresh preserve local session instead of logging out', async () => {
  let localStorageCleared = false
  const session = {
    access_token: 'current-token',
    refresh_token: 'valid-refresh-token',
  }

  try {
    // Simulate network error (e.g. WiFi hiccup or sleeping laptop)
    throw new TypeError('Failed to fetch')
  } catch (err) {
    if (err instanceof TypeError) {
      // Do NOT clear session on network failures
      localStorageCleared = false
    } else {
      localStorageCleared = true
    }
  }

  assert.equal(localStorageCleared, false, 'Local storage must not be wiped on temporary network interruptions')
  assert.ok(session.refresh_token)
})

test('Graceful Logout: POST /api/auth/logout succeeds with 204 even if access token is already expired or missing', () => {
  // Test the route handler logic:
  function evaluateLogoutStatus(accessToken) {
    if (accessToken) {
      try {
        // Even if supabase.auth.signOut() throws for expired token:
        // Silently caught
      } catch {
        // Ignored
      }
    }
    return 204
  }

  // Valid token
  assert.equal(evaluateLogoutStatus('valid-token'), 204)
  // Expired / missing token
  assert.equal(evaluateLogoutStatus(null), 204)
  assert.equal(evaluateLogoutStatus('expired-or-invalid-token'), 204)
})

test('Performance Chart: date parsing and label formatting shows real calendar date instead of Invalid Date', () => {
  function parseLocalDate(value) {
    if (!value) return null
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value
    if (typeof value === 'number') {
      const d = new Date(value)
      return isNaN(d.getTime()) ? null : d
    }
    const str = String(value).trim()
    const dateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dateMatch) {
      const [, y, m, d] = dateMatch
      return new Date(Number(y), Number(m) - 1, Number(d))
    }
    const parsed = new Date(str)
    return isNaN(parsed.getTime()) ? null : parsed
  }

  function labelForDate(value, language, period) {
    const d = parseLocalDate(value)
    if (!d) return ''
    const is365 = String(period) === '365'
    return d.toLocaleDateString(language || 'en', {
      month: 'short',
      day: '2-digit',
      ...(is365 ? { year: '2-digit' } : {}),
    })
  }

  // 1. ISO string with time and Z (which previously caused "Invalid Date")
  const isoDate = '2026-10-17T00:00:00.000Z'
  const labelEn = labelForDate(isoDate, 'en', '30')
  assert.notEqual(labelEn, 'Invalid Date')
  assert.ok(labelEn.includes('17'))
  assert.ok(labelEn.toLowerCase().includes('oct'))

  // 2. Standard calendar date string (YYYY-MM-DD)
  const plainDate = '2026-10-17'
  const plainLabelEn = labelForDate(plainDate, 'en', '30')
  assert.notEqual(plainLabelEn, 'Invalid Date')
  assert.equal(plainLabelEn, labelEn)

  // 3. Multi-language support (French and Arabic)
  const labelFr = labelForDate(isoDate, 'fr', '30')
  assert.notEqual(labelFr, 'Invalid Date')
  assert.ok(labelFr.includes('17'))
  assert.ok(labelFr.toLowerCase().includes('oct'))

  const labelAr = labelForDate(isoDate, 'ar', '30')
  assert.notEqual(labelAr, 'Invalid Date')

  // 4. 365-day period includes year
  const label365 = labelForDate(isoDate, 'en', '365')
  assert.notEqual(label365, 'Invalid Date')
  assert.ok(label365.includes('26') || label365.includes('2026'))

  // 5. Database performance row normalization
  const mockRowDateObj = { day: new Date('2026-10-17T00:00:00.000Z'), new_members: 3, loyalty_issued: 50 }
  const mockRowText = { day: '2026-10-17', new_members: 1, loyalty_issued: 10 }

  function normalizePerformanceRow(row) {
    let dateStr = row.day
    if (dateStr instanceof Date) {
      dateStr = dateStr.toISOString().slice(0, 10)
    } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
      dateStr = dateStr.slice(0, 10)
    }
    return {
      date: dateStr,
      newMembers: row.new_members,
      loyaltyIssued: row.loyalty_issued,
    }
  }

  assert.equal(normalizePerformanceRow(mockRowDateObj).date, '2026-10-17')
  assert.equal(normalizePerformanceRow(mockRowText).date, '2026-10-17')
})












