import { connectToMongo, clean, periodKey } from './db'
import { v4 as uuidv4 } from 'uuid'

// Resolve the org's active subscription -> plan document.
export async function getActivePlan(db, orgId) {
  const sub = await db.collection('subscriptions').findOne({ orgId, status: { $in: ['active', 'trialing', 'past_due'] } })
  if (!sub) {
    // fall back to Free plan
    const free = await db.collection('plans').findOne({ slug: 'free' })
    return { sub: null, plan: free }
  }
  const plan = await db.collection('plans').findOne({ id: sub.planId })
  return { sub, plan }
}

// Full entitlement snapshot for an org: plan + features + limits + usage + remaining.
export async function getEntitlements(db, orgId) {
  const { sub, plan } = await getActivePlan(db, orgId)
  const pk = periodKey()
  const counterDoc = await db.collection('usageCounters').findOne({ orgId, periodKey: pk })
  const usage = { ...(counterDoc?.counters || {}) }
  // Persistent-resource limits are counted from live collections, not metered counters.
  const resourceMap = { campaigns: 'campaigns', locations: 'gbpLocations', team_seats: 'memberships' }
  for (const [key, coll] of Object.entries(resourceMap)) {
    usage[key] = await db.collection(coll).countDocuments({ orgId })
  }
  const limits = plan?.limits || {}
  const remaining = {}
  for (const k of Object.keys(limits)) {
    const lim = limits[k]
    remaining[k] = lim === -1 ? -1 : Math.max(0, lim - (usage[k] || 0))
  }
  return {
    plan: plan ? { id: plan.id, name: plan.name, slug: plan.slug } : null,
    subscription: sub ? { id: sub.id, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, trialEnd: sub.trialEnd } : null,
    features: plan?.features || {},
    limits,
    usage,
    remaining,
    periodKey: pk,
  }
}

export async function hasFeature(db, orgId, featureKey) {
  const { plan } = await getActivePlan(db, orgId)
  return !!(plan?.features?.[featureKey])
}

// { allowed, used, limit, remaining }. limit -1 = unlimited.
export async function checkLimit(db, orgId, limitKey, requested = 1) {
  const { plan } = await getActivePlan(db, orgId)
  const limit = plan?.limits?.[limitKey]
  if (limit === undefined || limit === -1) return { allowed: true, used: 0, limit: -1, remaining: -1 }
  const pk = periodKey()
  const counterDoc = await db.collection('usageCounters').findOne({ orgId, periodKey: pk })
  const used = counterDoc?.counters?.[limitKey] || 0
  return { allowed: used + requested <= limit, used, limit, remaining: Math.max(0, limit - used) }
}

// For persistent-resource limits (e.g. campaigns, locations) count current docs.
export async function checkResourceLimit(db, orgId, limitKey, collection) {
  const { plan } = await getActivePlan(db, orgId)
  const limit = plan?.limits?.[limitKey]
  if (limit === undefined || limit === -1) return { allowed: true, used: 0, limit: -1, remaining: -1 }
  const used = await db.collection(collection).countDocuments({ orgId })
  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) }
}

// Atomically increment a metered counter for the current period.
export async function consume(db, orgId, limitKey, n = 1) {
  const pk = periodKey()
  await db.collection('usageCounters').updateOne(
    { orgId, periodKey: pk },
    { $inc: { [`counters.${limitKey}`]: n }, $setOnInsert: { id: uuidv4(), orgId, periodKey: pk, createdAt: new Date() } },
    { upsert: true }
  )
}

export function upgradePayload(limitKey, info, plan) {
  return {
    error: 'limit_reached',
    reason: `You've reached your plan limit for ${limitKey.replace(/_/g, ' ')}.`,
    limitKey,
    used: info?.used,
    limit: info?.limit,
    currentPlan: plan?.name || 'Free',
    upgradeUrl: '/billing',
  }
}

export function featurePayload(featureKey, plan) {
  return {
    error: 'feature_locked',
    reason: `This feature isn't included in your ${plan?.name || 'current'} plan.`,
    featureKey,
    currentPlan: plan?.name || 'Free',
    upgradeUrl: '/billing',
  }
}

export async function notify(db, orgId, userId, type, title, body = '') {
  const n = { id: uuidv4(), orgId, userId: userId || null, type, title, body, read: false, createdAt: new Date() }
  await db.collection('notifications').insertOne(n)
  return clean(n)
}
