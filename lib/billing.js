import { v4 as uuidv4 } from 'uuid'
import { clean } from './db'

export async function getSettings(db) {
  let s = await db.collection('settings').findOne({ id: 'global' })
  if (!s) {
    s = { id: 'global', taxPercent: 18, taxLabel: 'GST', currency: 'INR', announcement: '', defaultTrialDays: 14, createdAt: new Date() }
    await db.collection('settings').insertOne(s)
  }
  return clean(s)
}

export function planPrice(plan, interval = 'monthly', currency = 'INR') {
  const p = plan?.prices?.[currency]
  if (!p) return 0
  return interval === 'yearly' ? (p.yearly || 0) : (p.monthly || 0)
}

// Validate a coupon for a given org/user/plan/amount. Returns a rich object.
export async function validateCoupon(db, { code, orgId, userId, planId, amount }) {
  if (!code) return { valid: false, reason: 'No coupon code provided' }
  const coupon = await db.collection('coupons').findOne({ code: String(code).trim().toUpperCase() })
  if (!coupon) return { valid: false, reason: 'Invalid coupon code' }
  if (!coupon.isActive) return { valid: false, reason: 'This coupon is inactive' }
  const now = Date.now()
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return { valid: false, reason: 'This coupon is not active yet' }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return { valid: false, reason: 'This coupon has expired' }
  if (coupon.minAmount && amount < coupon.minAmount) return { valid: false, reason: `Minimum purchase of ${coupon.minAmount} required` }
  if (Array.isArray(coupon.applicablePlanIds) && coupon.applicablePlanIds.length && !coupon.applicablePlanIds.includes(planId)) {
    return { valid: false, reason: 'This coupon does not apply to the selected plan' }
  }
  if (coupon.maxRedemptions && (coupon.redemptionCount || 0) >= coupon.maxRedemptions) {
    return { valid: false, reason: 'This coupon has reached its usage limit' }
  }
  if (coupon.perUserLimit) {
    const used = await db.collection('couponRedemptions').countDocuments({ couponId: coupon.id, orgId })
    if (used >= coupon.perUserLimit) return { valid: false, reason: 'You have already used this coupon' }
  }
  if (coupon.firstTimeOnly) {
    const priorPaid = await db.collection('invoices').countDocuments({ orgId, status: 'paid', total: { $gt: 0 } })
    if (priorPaid > 0) return { valid: false, reason: 'This coupon is for first-time customers only' }
  }
  let discount = 0
  if (coupon.type === 'percent') discount = Math.round((amount * coupon.value) / 100)
  else discount = Math.min(coupon.value, amount)
  discount = Math.max(0, Math.min(discount, amount))
  return { valid: true, coupon: clean(coupon), discount }
}

// Compute invoice money breakdown.
export function computeTotals(amount, discount, taxPercent) {
  const subtotal = amount
  const afterDiscount = Math.max(0, subtotal - (discount || 0))
  const tax = Math.round((afterDiscount * (taxPercent || 0)) / 100)
  const total = afterDiscount + tax
  return { subtotal, discount: discount || 0, tax, total }
}

async function nextInvoiceNumber(db) {
  const count = await db.collection('invoices').countDocuments()
  const year = new Date().getFullYear()
  return `NAI-${year}-${String(count + 1).padStart(5, '0')}`
}

// Activate/upgrade a paid subscription for an org and issue an invoice + payment.
export async function activatePaidSubscription(db, { org, plan, interval, currency, totals, coupon, gateway, gatewayRef, userId }) {
  const now = new Date()
  const days = interval === 'yearly' ? 365 : 30
  const periodEnd = new Date(now.getTime() + days * 24 * 3600 * 1000)

  const existing = await db.collection('subscriptions').findOne({ orgId: org.id })
  const subPatch = {
    planId: plan.id, status: 'active', gateway: gateway || null, interval, currency,
    currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, trialEnd: null, updatedAt: now,
  }
  if (existing) {
    await db.collection('subscriptions').updateOne({ id: existing.id }, { $set: subPatch })
  } else {
    await db.collection('subscriptions').insertOne({ id: uuidv4(), orgId: org.id, createdAt: now, ...subPatch })
  }

  const number = await nextInvoiceNumber(db)
  const invoice = {
    id: uuidv4(), number, orgId: org.id, planId: plan.id, planName: plan.name, interval, currency,
    lineItems: [{ label: `${plan.name} plan (${interval})`, amount: totals.subtotal }],
    subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total,
    couponCode: coupon?.code || null, status: 'paid', gateway: gateway || 'stub', issuedAt: now, createdAt: now,
  }
  await db.collection('invoices').insertOne(invoice)

  const payment = {
    id: uuidv4(), orgId: org.id, invoiceId: invoice.id, gateway: gateway || 'stub',
    gatewayPaymentId: gatewayRef || `stub_${uuidv4().slice(0, 8)}`, amount: totals.total, currency,
    status: 'captured', method: gateway === 'razorpay' ? 'razorpay' : 'stub', refunds: [], createdAt: now,
  }
  await db.collection('payments').insertOne(payment)

  if (coupon) {
    await db.collection('coupons').updateOne({ id: coupon.id }, { $inc: { redemptionCount: 1 } })
    await db.collection('couponRedemptions').insertOne({ id: uuidv4(), couponId: coupon.id, orgId: org.id, userId: userId || null, amount: totals.discount, at: now })
  }
  return { invoice: clean(invoice), payment: clean(payment), periodEnd }
}
