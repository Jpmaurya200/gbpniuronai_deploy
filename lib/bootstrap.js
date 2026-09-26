import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_PLANS } from './plans'
import { hashPassword } from './auth'

let booted = false

// Seed default plans + a super admin once. Idempotent.
export async function ensureDefaults(db) {
  if (booted) return
  booted = true

  // Deduplicate any duplicate plans in the database by slug
  try {
    const allPlans = await db.collection('plans').find({}).sort({ createdAt: 1 }).toArray()
    const seenSlugs = new Set()
    const duplicateIds = []
    for (const p of allPlans) {
      if (!p.slug) continue
      if (seenSlugs.has(p.slug)) {
        if (p._id) duplicateIds.push(p._id)
        if (p.id) duplicateIds.push(p.id)
      } else {
        seenSlugs.add(p.slug)
      }
    }
    if (duplicateIds.length > 0) {
      await db.collection('plans').deleteMany({
        $or: [
          { _id: { $in: duplicateIds } },
          { id: { $in: duplicateIds } },
        ],
      })
    }
  } catch (err) {
    console.error('[BOOTSTRAP] Error deduplicating plans:', err)
  }

  const planCount = await db.collection('plans').countDocuments()
  if (planCount === 0) {
    const now = new Date()
    const docs = DEFAULT_PLANS.map((p) => ({ id: uuidv4(), ...p, createdAt: now, updatedAt: now }))
    await db.collection('plans').insertMany(docs)
  }
  const superEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@niuron.ai').toLowerCase()
  const existing = await db.collection('users').findOne({ email: superEmail })
  if (!existing) {
    const now = new Date()
    const orgId = uuidv4()
    const userId = uuidv4()
    await db.collection('organizations').insertOne({ id: orgId, name: 'niuronai HQ', ownerUserId: userId, billingProfile: {}, createdAt: now })
    await db.collection('users').insertOne({
      id: userId, email: superEmail, name: 'Super Admin',
      passwordHash: await hashPassword(process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345'),
      role: 'super_admin', orgId, status: 'active', createdAt: now, lastLoginAt: null,
    })
    await db.collection('memberships').insertOne({ id: uuidv4(), orgId, userId, role: 'super_admin', createdAt: now })
  }

  // Backfill legacy single-tenant data onto the super admin's org so nothing breaks.
  const su = await db.collection('users').findOne({ email: superEmail })
  if (su?.orgId) {
    for (const coll of ['campaigns', 'reviews', 'audits', 'events']) {
      await db.collection(coll).updateMany(
        { $or: [{ orgId: { $exists: false } }, { orgId: null }] },
        { $set: { orgId: su.orgId } }
      )
    }
  }
}

// Create an organization + owner user + Free subscription for a new signup.
export async function provisionSignup(db, { email, name, passwordHash, googleId, avatar }) {
  const now = new Date()
  const orgId = uuidv4()
  const userId = uuidv4()
  const org = { id: orgId, name: (name || email.split('@')[0]) + "'s workspace", ownerUserId: userId, billingProfile: { country: 'IN', currency: 'INR' }, createdAt: now }
  await db.collection('organizations').insertOne(org)
  const user = {
    id: userId, email: email.toLowerCase(), name: name || '', passwordHash: passwordHash || null,
    googleId: googleId || null, avatar: avatar || '', role: 'owner', orgId, status: 'active', createdAt: now, lastLoginAt: now,
  }
  await db.collection('users').insertOne(user)
  await db.collection('memberships').insertOne({ id: uuidv4(), orgId, userId, role: 'owner', createdAt: now })
  // attach Free plan subscription
  const free = await db.collection('plans').findOne({ slug: 'free' })
  if (free) {
    await db.collection('subscriptions').insertOne({
      id: uuidv4(), orgId, planId: free.id, status: 'active', gateway: null, gatewaySubId: null,
      currentPeriodStart: now, currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEnd: null, createdAt: now, updatedAt: now,
    })
  }
  return { user, org }
}
