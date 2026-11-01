import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createApp } from '../src/app.js'
import { pool } from '../src/database.js'
import { createAdminAuthClient, createAuthClient } from '../src/supabase.js'
import { normalizePhone } from '../src/authUtils.js'

// Helper for HTTP requests against Express app
function makeRequest(app, method, path, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      try {
        const fetchOptions = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
        }
        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
          fetchOptions.body = JSON.stringify(body)
        }
        const res = await fetch(`http://127.0.0.1:${port}${path}`, fetchOptions)
        let json = null
        const text = await res.text()
        try {
          json = JSON.parse(text)
        } catch {
          json = text
        }
        server.close(() => {
          resolve({ status: res.status, headers: res.headers, data: json })
        })
      } catch (err) {
        server.close(() => reject(err))
      }
    })
  })
}

test('LOYALTEA END-TO-END AUTONOMOUS AUDIT, WORKFLOW & SECURITY TEST SUITE', async (t) => {
  const app = createApp()
  const adminClient = createAdminAuthClient()
  const authClient = createAuthClient()

  // Track created test IDs for guaranteed cleanup
  const cleanupState = {
    authIds: [],
    businessIds: [],
    planIds: [],
  }

  t.after(async () => {
    console.log('--- EXECUTING TEST CLEANUP FOR ALL AGY_TEST_ RECORDS ---')
    // Always purge auth users first
    for (const id of cleanupState.authIds) {
      await pool.query('DELETE FROM public.customers WHERE id = $1', [id]).catch(() => {})
      await pool.query('DELETE FROM public.users WHERE id = $1', [id]).catch(() => {})
      await adminClient.auth.admin.deleteUser(id).catch(() => {})
    }
    try {
      await pool.query(`
        UPDATE public.loyalty_programs SET is_active = false WHERE business_id IN (
          SELECT id FROM public.businesses WHERE name LIKE 'AGY_TEST_%'
        );
        UPDATE public.customer_memberships SET is_active = false WHERE program_id IN (
          SELECT id FROM public.loyalty_programs WHERE business_id IN (
            SELECT id FROM public.businesses WHERE name LIKE 'AGY_TEST_%'
          )
        );
        UPDATE public.businesses SET archived_at = now() WHERE name LIKE 'AGY_TEST_%';
        UPDATE public.subscription_plans SET is_active = false WHERE name LIKE 'AGY_TEST_%';
      `)
      console.log('Cleanup finished cleanly.')
    } catch (err) {
      console.error('Error during cleanup:', err)
    }
  })

  // -------------------------------------------------------------
  // PHASE 1: Authentication & Account Provisioning
  // -------------------------------------------------------------
  const runTag = Date.now().toString().slice(-5)
  const phoneOwnerA = `0550${runTag}1`
  const phoneOwnerB = `0550${runTag}2`
  const phoneCust1 = `0770${runTag}1`
  const phoneCust2 = `0770${runTag}2`
  let adminToken = null
  let ownerAToken = null
  let ownerBToken = null
  let customer1Token = null
  let customer2Token = null

  let businessA = null
  let businessB = null
  let customer1Id = null
  let customer2Id = null

  await t.test('1.1 Login as existing Platform Admin (eimane)', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/login', {
      body: {
        identifier: '0776168926',
        identifierType: 'phone',
        password: 'lassmano2005',
      },
    })
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`)
    assert.ok(res.data.session?.access_token)
    adminToken = res.data.session.access_token
  })

  await t.test('1.2 Platform Admin Overview & Subscription Plans', async () => {
    const overview = await makeRequest(app, 'GET', '/api/admin/overview', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert.equal(overview.status, 200)

    const plans = await makeRequest(app, 'GET', '/api/admin/subscription-plans', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert.equal(plans.status, 200)
    assert.ok(Array.isArray(plans.data.plans))

    // Create an AGY_TEST_ Subscription Plan
    const planRes = await makeRequest(app, 'POST', '/api/admin/subscription-plans', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'AGY_TEST_Standard_Plan',
        description: 'Test plan for automated audit',
        price: 2500,
        currency: 'DZD',
        durationDays: 30,
        features: { multi_branch: true },
      },
    })
    assert.equal(planRes.status, 201)
    cleanupState.planIds.push(planRes.data.plan.id)
  })

  await t.test('1.3 Platform Admin provisions Business A and Business B', async () => {
    const activePlan = cleanupState.planIds[0]

    // Business A
    const provA = await makeRequest(app, 'POST', '/api/admin/businesses/provision', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        businessName: 'AGY_TEST_Coffee_Shop_A',
        slug: `agy-test-coffee-a-${Date.now()}`,
        ownerFullName: 'AGY_TEST Owner A',
        ownerPhone: phoneOwnerA,
        ownerPassword: 'TestOwnerPassword123!',
        planId: activePlan,
      },
    })
    assert.equal(provA.status, 201, `Failed to provision Business A: ${JSON.stringify(provA.data)}`)
    businessA = provA.data.business
    cleanupState.businessIds.push(businessA.id)
    cleanupState.authIds.push(provA.data.owner.id)

    // Business B
    const provB = await makeRequest(app, 'POST', '/api/admin/businesses/provision', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        businessName: 'AGY_TEST_Bakery_B',
        slug: `agy-test-bakery-b-${Date.now()}`,
        ownerFullName: 'AGY_TEST Owner B',
        ownerPhone: phoneOwnerB,
        ownerPassword: 'TestOwnerPassword123!',
        planId: activePlan,
      },
    })
    assert.equal(provB.status, 201, `Failed to provision Business B: ${JSON.stringify(provB.data)}`)
    businessB = provB.data.business
    cleanupState.businessIds.push(businessB.id)
    cleanupState.authIds.push(provB.data.owner.id)

    // Activate subscriptions via admin cash renewal
    const renewA = await makeRequest(app, 'POST', '/api/admin/subscriptions/renew-cash', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        businessId: businessA.id,
        planId: activePlan,
        amount: 2500,
        currency: 'DZD',
        idempotencyKey: crypto.randomUUID(),
      },
    })
    assert.equal(renewA.status, 201, `Renew A failed: ${JSON.stringify(renewA.data)}`)

    const renewB = await makeRequest(app, 'POST', '/api/admin/subscriptions/renew-cash', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        businessId: businessB.id,
        planId: activePlan,
        amount: 2500,
        currency: 'DZD',
        idempotencyKey: crypto.randomUUID(),
      },
    })
    assert.equal(renewB.status, 201, `Renew B failed: ${JSON.stringify(renewB.data)}`)
  })

  await t.test('1.4 Business Owners Login', async () => {
    // Owner A
    const loginA = await makeRequest(app, 'POST', '/api/auth/login', {
      body: {
        identifier: phoneOwnerA,
        identifierType: 'phone',
        password: 'TestOwnerPassword123!',
      },
    })
    assert.equal(loginA.status, 200)
    ownerAToken = loginA.data.session.access_token

    // Owner B
    const loginB = await makeRequest(app, 'POST', '/api/auth/login', {
      body: {
        identifier: phoneOwnerB,
        identifierType: 'phone',
        password: 'TestOwnerPassword123!',
      },
    })
    assert.equal(loginB.status, 200)
    ownerBToken = loginB.data.session.access_token
  })

  await t.test('1.5 Customer Signups (Case A: Public Registration)', async () => {
    // Customer 1
    const cust1 = await makeRequest(app, 'POST', '/api/auth/signup', {
      body: {
        fullName: 'AGY_TEST Customer One',
        phone: phoneCust1,
        password: 'CustomerPass123!',
        email: `agy_customer_1_${runTag}@test.local`,
      },
    })
    assert.equal(cust1.status, 201, `Cust 1 signup failed: ${JSON.stringify(cust1.data)}`)
    assert.ok(cust1.data.session?.access_token)
    customer1Token = cust1.data.session.access_token
    customer1Id = cust1.data.user.id
    cleanupState.authIds.push(customer1Id)

    // Customer 2
    const cust2 = await makeRequest(app, 'POST', '/api/auth/signup', {
      body: {
        fullName: 'AGY_TEST Customer Two',
        phone: phoneCust2,
        password: 'CustomerPass123!',
      },
    })
    assert.equal(cust2.status, 201, `Cust 2 signup failed: ${JSON.stringify(cust2.data)}`)
    assert.ok(cust2.data.session?.access_token)
    customer2Token = cust2.data.session.access_token
    customer2Id = cust2.data.user.id
    cleanupState.authIds.push(customer2Id)
  })

  await t.test('1.6 Platform admin can edit and delete subscription plan', async () => {
    const createRes = await makeRequest(app, 'POST', '/api/admin/subscription-plans', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: `Temp Plan ${runTag}`,
        description: 'Temporary plan for testing edit and delete',
        price: 2500,
        currency: 'DZD',
        durationDays: 30,
      },
    })
    assert.equal(createRes.status, 201)
    const tempPlan = createRes.data.plan
    assert.ok(tempPlan?.id)

    const editRes = await makeRequest(app, 'PATCH', `/api/admin/subscription-plans/${tempPlan.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: `Edited Plan ${runTag}`,
        price: 3000,
      },
    })
    assert.equal(editRes.status, 200, `Edit plan failed: ${JSON.stringify(editRes.data)}`)
    assert.equal(editRes.data.plan?.name, `Edited Plan ${runTag}`)
    assert.equal(Number(editRes.data.plan?.price), 3000)

    const delRes = await makeRequest(app, 'DELETE', `/api/admin/subscription-plans/${tempPlan.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert.equal(delRes.status, 200, `Delete plan failed: ${JSON.stringify(delRes.data)}`)
    assert.equal(delRes.data.deleted, true)
  })

  // -------------------------------------------------------------
  // PHASE 2: Business Offer & Loyalty Configuration Workflows
  // -------------------------------------------------------------
  let programA = null
  let offerA = null

  await t.test('2.1 Business Owner A checks dashboard and creates active offer', async () => {
    const dash = await makeRequest(app, 'GET', '/api/dashboard', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    })
    assert.equal(dash.status, 200, `Dashboard failed: ${JSON.stringify(dash.data)}`)
    programA = dash.data.program
    assert.ok(programA?.id)

    // Delete any auto-provisioned default initial reward so business can set their custom offer
    const initialReward = programA.rewards?.[0]
    if (initialReward) {
      const delRes = await makeRequest(app, 'DELETE', `/api/rewards/${initialReward.id}`, {
        headers: { Authorization: `Bearer ${ownerAToken}` },
      })
      assert.equal(delRes.status, 200)
    }

    // Create single active offer for Business A with Points model
    const offerRes = await makeRequest(app, 'POST', '/api/rewards', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
      body: {
        program_id: programA.id,
        name: 'Free Special Coffee',
        description: 'Enjoy a free handcrafted coffee drink',
        required_points: 100,
        is_active: true,
      },
    })
    assert.equal(offerRes.status, 201, `Offer creation failed: ${JSON.stringify(offerRes.data)}`)
    offerA = offerRes.data.data

    // Verify model was synchronized to POINTS automatically
    const updatedDash = await makeRequest(app, 'GET', '/api/dashboard', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    })
    assert.equal(updatedDash.data.program.model, 'POINTS')
  })

  await t.test('2.2 Enforce Single Active Offer constraint (409 Conflict)', async () => {
    const dupRes = await makeRequest(app, 'POST', '/api/rewards', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
      body: {
        program_id: programA.id,
        name: 'Another Active Offer',
        required_points: 200,
        is_active: true,
      },
    })
    assert.equal(dupRes.status, 409, 'Expected 409 Conflict when creating second active offer')
    assert.equal(dupRes.data.code, 'ACTIVE_OFFER_EXISTS')
  })

  // -------------------------------------------------------------
  // PHASE 3: QR Joining Workflows (Cases A, B, C)
  // -------------------------------------------------------------
  let membership1A = null

  await t.test('3.1 Public Business Slug Lookup', async () => {
    const pubRes = await makeRequest(app, 'GET', `/api/public/businesses/${businessA.slug}`)
    assert.equal(pubRes.status, 200, `Public slug lookup failed: ${JSON.stringify(pubRes.data)}`)
    assert.equal(pubRes.data.business.name, 'AGY_TEST_Coffee_Shop_A')
    assert.ok(pubRes.data.program?.id)
  })

  await t.test('3.2 Customer 1 joins Business A program (Case C: Authenticated)', async () => {
    const joinRes = await makeRequest(app, 'POST', `/api/public/programs/${programA.id}/join`, {
      headers: { Authorization: `Bearer ${customer1Token}` },
    })
    assert.equal(joinRes.status, 201, `Join program failed: ${JSON.stringify(joinRes.data)}`)
    membership1A = joinRes.data.membership
    assert.ok(membership1A?.secure_token)
    assert.equal(membership1A.points_balance, 0)
  })

  await t.test('3.3 Customer 1 re-joining Business A returns 409 MEMBERSHIP_EXISTS', async () => {
    const reJoin = await makeRequest(app, 'POST', `/api/public/programs/${programA.id}/join`, {
      headers: { Authorization: `Bearer ${customer1Token}` },
    })
    assert.equal(reJoin.status, 409)
    assert.equal(reJoin.data.code, 'MEMBERSHIP_EXISTS')
  })

  await t.test('3.4 Customer 1 retrieves Apple Wallet .pkpass and Google Wallet pass object', async () => {
    // 1. Apple Wallet pass
    const applePassRes = await makeRequest(app, 'GET', `/api/wallet/apple/${membership1A.id}`, {
      headers: { Authorization: `Bearer ${customer1Token}` },
    })
    assert.equal(applePassRes.status, 200, `Apple pass request failed: ${JSON.stringify(applePassRes.data)}`)
    assert.equal(applePassRes.headers.get('content-type'), 'application/vnd.apple.pkpass')
    assert.ok(applePassRes.headers.get('content-disposition')?.includes('.pkpass'))

    // 2. Google Wallet pass
    const googlePassRes = await makeRequest(app, 'GET', `/api/wallet/google/${membership1A.id}`, {
      headers: { Authorization: `Bearer ${customer1Token}` },
    })
    assert.equal(googlePassRes.status, 200, `Google pass request failed: ${JSON.stringify(googlePassRes.data)}`)
    assert.equal(googlePassRes.data.ok, true)
    assert.equal(googlePassRes.data.loyaltyObject?.accountId, membership1A.secure_token)
    assert.equal(googlePassRes.data.loyaltyObject?.barcode?.value, membership1A.secure_token)
  })

  await t.test('3.5 Wallet security & IDOR isolation: Customer 2 cannot access Customer 1 wallet pass', async () => {
    // Customer 2 attempts to fetch Customer 1's Apple pass
    const appleIdor = await makeRequest(app, 'GET', `/api/wallet/apple/${membership1A.id}`, {
      headers: { Authorization: `Bearer ${customer2Token}` },
    })
    assert.equal(appleIdor.status, 403, 'Customer 2 should be blocked with 403 from fetching Customer 1 Apple pass')

    // Customer 2 attempts to fetch Customer 1's Google pass
    const googleIdor = await makeRequest(app, 'GET', `/api/wallet/google/${membership1A.id}`, {
      headers: { Authorization: `Bearer ${customer2Token}` },
    })
    assert.equal(googleIdor.status, 403, 'Customer 2 should be blocked with 403 from fetching Customer 1 Google pass')
  })

  // -------------------------------------------------------------
  // PHASE 4: Counter Operations, Points Awarding & Reward Redemption
  // -------------------------------------------------------------
  await t.test('4.1 Staff lookup customer by membership secure_token', async () => {
    const lookup = await makeRequest(app, 'GET', `/api/loyalty/lookup/${membership1A.secure_token}`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    })
    assert.equal(lookup.status, 200, `Staff lookup failed: ${JSON.stringify(lookup.data)}`)
    assert.equal(lookup.data.membership.id, membership1A.id)
    assert.equal(lookup.data.membership.customers.full_name, 'AGY_TEST Customer One')
  })

  await t.test('4.2 Award exact points at counter (e.g. 322 points)', async () => {
    const locationRes = await pool.query('SELECT id FROM public.business_locations WHERE business_id = $1 LIMIT 1', [businessA.id])
    const locationId = locationRes.rows[0].id
    const requestId = crypto.randomUUID()

    const earnRes = await makeRequest(app, 'POST', '/api/loyalty/earn', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
      body: {
        membershipId: membership1A.id,
        locationId,
        model: 'POINTS',
        amount: 322,
        requestId,
      },
    })
    assert.equal(earnRes.status, 201, `Earn points failed: ${JSON.stringify(earnRes.data)}`)

    // Customer cards view verifies 322 points
    const custCards = await makeRequest(app, 'GET', '/api/customer/memberships', {
      headers: { Authorization: `Bearer ${customer1Token}` },
    })
    assert.equal(custCards.status, 200)
    const card = custCards.data.memberships.find((m) => m.id === membership1A.id)
    assert.equal(card.points_balance, 322)
  })

  await t.test('4.3 Redeem reward and verify balance atomic reset to 0', async () => {
    const locationRes = await pool.query('SELECT id FROM public.business_locations WHERE business_id = $1 LIMIT 1', [businessA.id])
    const locationId = locationRes.rows[0].id
    const redeemRequestId = crypto.randomUUID()

    const redeemRes = await makeRequest(app, 'POST', '/api/loyalty/redeem', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
      body: {
        membershipId: membership1A.id,
        rewardId: offerA.id,
        locationId,
        requestId: redeemRequestId,
      },
    })
    assert.equal(redeemRes.status, 201, `Redemption failed: ${JSON.stringify(redeemRes.data)}`)

    // Verify balance atomically reset to 0
    const custCardsAfter = await makeRequest(app, 'GET', '/api/customer/memberships', {
      headers: { Authorization: `Bearer ${customer1Token}` },
    })
    const cardAfter = custCardsAfter.data.memberships.find((m) => m.id === membership1A.id)
    assert.equal(cardAfter.points_balance, 0, 'Customer points balance must reset to 0 after redemption')
  })

  // -------------------------------------------------------------
  // PHASE 5: Security & Multi-Tenant Isolation Checks
  // -------------------------------------------------------------
  await t.test('5.1 Cross-tenant isolation: Owner A cannot access Business B dashboard', async () => {
    const crossDash = await makeRequest(app, 'GET', `/api/dashboard?businessId=${businessB.id}`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    })
    assert.equal(crossDash.status, 403, 'Cross-tenant dashboard access must return 403 Forbidden')
    assert.equal(crossDash.data.code, 'BUSINESS_ACCESS_DENIED')
  })

  await t.test('5.2 Cross-tenant isolation: Owner B cannot lookup Customer 1 of Business A', async () => {
    const illegalLookup = await makeRequest(app, 'GET', `/api/loyalty/lookup/${membership1A.secure_token}`, {
      headers: { Authorization: `Bearer ${ownerBToken}` },
    })
    assert.equal(illegalLookup.status, 403, 'Owner B must be rejected with 403 when inspecting Business A customer token')
  })

  await t.test('5.3 Self-awarding points prevention', async () => {
    // If Owner A attempts to earn points on their own customer membership
    await pool.query(
      `INSERT INTO public.customers (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [cleanupState.authIds[0]] // Owner A user id
    )
    const ownMembership = await pool.query(
      `INSERT INTO public.customer_memberships (customer_id, program_id, secure_token)
       VALUES ($1, $2, gen_random_uuid())
       RETURNING id`,
      [cleanupState.authIds[0], programA.id] // Owner A user id
    )
    const ownMembId = ownMembership.rows[0].id
    const locationRes = await pool.query('SELECT id FROM public.business_locations WHERE business_id = $1 LIMIT 1', [businessA.id])

    const selfEarn = await makeRequest(app, 'POST', '/api/loyalty/earn', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
      body: {
        membershipId: ownMembId,
        locationId: locationRes.rows[0].id,
        model: 'POINTS',
        amount: 50,
        requestId: crypto.randomUUID(),
      },
    })
    assert.equal(selfEarn.status, 403, 'Self-awarding points must be blocked with 403')
  })

  await t.test('5.4 Non-admin cannot access Platform Admin endpoints', async () => {
    const forbidden = await makeRequest(app, 'GET', '/api/admin/overview', {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    })
    assert.equal(forbidden.status, 403)
  })

  // -------------------------------------------------------------
  // PHASE 6: Activity History Pagination
  // -------------------------------------------------------------
  await t.test('6.1 Activity history returns paginated entries with stable ordering', async () => {
    const actRes = await makeRequest(app, 'GET', `/api/activity?businessId=${businessA.id}&limit=2&offset=0`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    })
    assert.equal(actRes.status, 200, `Activity request failed: ${JSON.stringify(actRes.data)}`)
    assert.ok(Array.isArray(actRes.data.activities))
    assert.ok(actRes.data.activities.length <= 2)
    assert.ok(actRes.data.total >= 2)
  })

  await t.test('6.2 Customer activity returns 200 without 403 access denied', async () => {
    const actRes = await makeRequest(app, 'GET', '/api/activity?limit=5&offset=0', {
      headers: { Authorization: `Bearer ${customer1Token}` },
    })
    assert.equal(actRes.status, 200, `Customer activity failed: ${JSON.stringify(actRes.data)}`)
    assert.ok(Array.isArray(actRes.data.activities))
  })
})
