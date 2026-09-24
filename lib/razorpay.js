import Razorpay from 'razorpay'
import { validatePaymentVerification, validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils'

// Razorpay is "enabled" only when server keys are present. Otherwise the app
// stays in stub gateway mode (immediate confirm) so it works without keys.
export function razorpayEnabled() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

let _client
export function getRazorpay() {
  if (!razorpayEnabled()) return null
  if (!_client) {
    _client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  }
  return _client
}

export const publicKeyId = () => process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || null

// Verify the Checkout response signature. Throws on mismatch.
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  return validatePaymentVerification({ order_id: orderId, payment_id: paymentId }, signature, process.env.RAZORPAY_KEY_SECRET)
}

// Verify a webhook payload against the raw body. Throws on mismatch.
export function verifyWebhook(rawBody, signature) {
  return validateWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET || '')
}
