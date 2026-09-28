import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_PLANS } from './plans'
import { hashPassword } from './auth'

let booted = false

// Seed default plans + a super admin once. Idempotent.
export async function ensureDefaults(db) {
  if (booted) return
  booted = true

  // --- Plan migration: deactivate legacy tier-based plans, seed new duration-based plans ---
  const LEGACY_SLUGS = new Set(['free', 'starter', 'growth', 'pro'])
  const NEW_SLUGS = new Set(DEFAULT_PLANS.map((p) => p.slug))

  try {
    const allPlans = await db.collection('plans').find({}).sort({ createdAt: 1 }).toArray()

    // 1. Deduplicate plans by slug (keep oldest)
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
        $or: [{ _id: { $in: duplicateIds } }, { id: { $in: duplicateIds } }],
      })
    }

    // 2. Deactivate legacy plans (free, starter, growth, pro) so they don't show on pricing
    const legacyPlanSlugs = allPlans.filter((p) => LEGACY_SLUGS.has(p.slug) && (p.isActive || p.isPublic)).map((p) => p.slug)
    if (legacyPlanSlugs.length > 0) {
      await db.collection('plans').updateMany(
        { slug: { $in: legacyPlanSlugs } },
        { $set: { isActive: false, isPublic: false, updatedAt: new Date() } }
      )
      console.log('[BOOTSTRAP] Deactivated legacy plans:', legacyPlanSlugs)
    }

    // 3. Seed new duration-based plans if they don't exist yet
    const existingSlugs = new Set(allPlans.map((p) => p.slug))
    const missing = DEFAULT_PLANS.filter((p) => !existingSlugs.has(p.slug))
    if (missing.length > 0) {
      const now = new Date()
      const docs = missing.map((p) => ({ id: uuidv4(), ...p, createdAt: now, updatedAt: now }))
      await db.collection('plans').insertMany(docs)
      console.log('[BOOTSTRAP] Seeded new plans:', missing.map((p) => p.slug))
    }
  } catch (err) {
    console.error('[BOOTSTRAP] Error migrating plans:', err)
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

// Create an organization + owner user + Trial subscription for a new signup.
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
  // New users don't get a free subscription — they must purchase a trial (₹199) or a plan.
  // We still create a minimal subscription so entitlements code doesn't break,
  // but with status 'inactive' so it's essentially a no-plan state.
  const trial = await db.collection('plans').findOne({ slug: 'trial' })
  if (trial) {
    // Don't auto-activate; user needs to pay ₹199 first
    // But we mark it as 'pending_trial' so the UI can show the trial CTA
  }
  return { user, org }
}
