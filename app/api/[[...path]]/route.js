import crypto from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { connectToMongo, clean } from '@/lib/db'
import { hashPassword, verifyPassword, signToken, getAuthContext, isAdmin, serializeSession, serializeClear } from '@/lib/auth'
import { getEntitlements, getActivePlan, checkLimit, checkResourceLimit, consume, hasFeature, upgradePayload, featurePayload, notify } from '@/lib/entitlements'
import { ensureDefaults, provisionSignup } from '@/lib/bootstrap'
import { getSettings, planPrice, validateCoupon, computeTotals, activatePaidSubscription } from '@/lib/billing'
import { razorpayEnabled, getRazorpay, publicKeyId, verifyPaymentSignature, verifyWebhook } from '@/lib/razorpay'
import { sendEmail, sendWelcomeEmail, sendInvoiceEmail, sendReviewAlertEmail, sendTeamInviteEmail } from '@/lib/mailer'
import {
  googleEnabled, buildAuthUrl, exchangeCode, getUserInfo, listAccounts, listLocations,
  fetchAllBusinessLocations,
  sealToken, unsealToken, refreshAccessToken, listGoogleReviews, publishGoogleReviewReply, starRatingToNumber,
  normalizeLocation, GBP_SCOPE, LOGIN_SCOPE, loginRedirectUri, gbpRedirectUri, randomState,
  signOAuthState, verifyOAuthState, baseUrl,
} from '@/lib/google'

function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

function json(data, status = 200) {
  return handleCORS(NextResponse.json(data, { status }))
}

// --- OAuth cookie/redirect helpers ---
function readReqCookie(request, name) {
  const raw = request.headers.get('cookie') || ''
  const m = raw.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
  return m ? decodeURIComponent(m[1]) : null
}
function stateCookie(name, value, maxAge = 600) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`
}
function redirectTo(pathAndQuery, req = null) {
  const base = baseUrl(req)
  return handleCORS(NextResponse.redirect(`${base}${pathAndQuery}`))
}

function slugify(str) {
  return String(str || 'business')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24)
}

// ---------------------------------------------------------------------------
// AI Provider Abstraction: OpenRouter, Google Gemini, and Emergent Gateway
// ---------------------------------------------------------------------------
const LLM_MODEL = process.env.OPENROUTER_MODEL || process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'openrouter/free'

const FREE_OPENROUTER_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
]

async function callOpenRouter(apiKey, messages, temperature = 0.85) {
  const cleanKey = String(apiKey || '').trim().replace(/^["']|["']$/g, '')
  if (!cleanKey) throw new Error('OpenRouter API key is empty')

  const initialModel = process.env.OPENROUTER_MODEL || 'openrouter/free'
  const modelsToTry = [initialModel]
  for (const fm of FREE_OPENROUTER_MODELS) {
    if (!modelsToTry.includes(fm)) modelsToTry.push(fm)
  }

  let lastErr = null
  for (const model of modelsToTry) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'https://niuronai.com',
          'X-Title': 'niuronai Local SEO',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errMsg = data?.error?.message || `OpenRouter request failed (${res.status})`
        console.warn(`[OpenRouter: ${model}] HTTP ${res.status}: ${errMsg}`)
        lastErr = new Error(errMsg)
        // If 401 Unauthorized, key itself is invalid
        if (res.status === 401) throw lastErr
        // If 402 (Payment required / Insufficient credits), 404 (model not found), or 429, try next free model
        continue
      }

      const content = data?.choices?.[0]?.message?.content || ''
      if (content && typeof content === 'string' && content.trim()) {
        return content
      }
    } catch (err) {
      lastErr = err
      if (err.message && err.message.includes('401')) throw err
      console.warn(`[OpenRouter: ${model}] error:`, err.message)
    }
  }

  throw lastErr || new Error('All OpenRouter models failed to respond.')
}

async function callGemini(apiKey, messages, temperature = 0.85) {
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google Gemini request failed (${res.status})`)
  }
  return data?.choices?.[0]?.message?.content || ''
}

async function callEmergent(apiKey, messages, temperature = 0.85) {
  const llmUrl = process.env.EMERGENT_LLM_URL || 'https://integrations.emergentagent.com/llm/chat/completions'
  const llmModel = process.env.LLM_MODEL || 'vertex_ai/gemini-3-flash-preview'
  const res = await fetch(llmUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: llmModel, messages, temperature }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `Emergent LLM request failed (${res.status})`)
  }
  return data?.choices?.[0]?.message?.content || ''
}

async function callLLM(messages, temperature = 0.85) {
  const envEmergent = process.env.EMERGENT_LLM_KEY || ''

  // 1. Auto-detect OpenRouter key (explicit OPENROUTER_API_KEY / OPENROUTER_KEY or prefixed with sk-or- or sk-)
  const openrouterKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_KEY ||
    (envEmergent.startsWith('sk-or-') || envEmergent.startsWith('sk-') ? envEmergent : null)

  // 2. Auto-detect Gemini key (explicit GEMINI_API_KEY or prefixed with AIzaSy)
  const geminiKey =
    process.env.GEMINI_API_KEY ||
    (envEmergent.startsWith('AIzaSy') ? envEmergent : null)

  // 3. Emergent universal gateway key
  const emergentKey =
    envEmergent && !envEmergent.startsWith('AIzaSy') && !envEmergent.startsWith('sk-or-') && !envEmergent.startsWith('sk-')
      ? envEmergent
      : null

  const providers = []
  if (openrouterKey) {
    providers.push({ name: 'OpenRouter', fn: () => callOpenRouter(openrouterKey, messages, temperature) })
  }
  if (geminiKey) {
    providers.push({ name: 'Google Gemini', fn: () => callGemini(geminiKey, messages, temperature) })
  }
  if (emergentKey) {
    providers.push({ name: 'Emergent Gateway', fn: () => callEmergent(emergentKey, messages, temperature) })
  }

  if (providers.length === 0) {
    throw new Error('No AI API key configured. Please set OPENROUTER_API_KEY or GEMINI_API_KEY in environment variables.')
  }

  let lastError = null
  for (const provider of providers) {
    try {
      const content = await provider.fn()
      if (content && typeof content === 'string' && content.trim()) {
        return content
      }
    } catch (err) {
      console.warn(`[AI Provider: ${provider.name}] failed: ${err.message}`)
      lastError = err
      // Seamlessly fall through to next provider if available
    }
  }

  throw lastError || new Error('All configured AI providers failed to generate a response.')
}

function extractJsonArray(text) {
  if (!text) return null
  let t = String(text).replace(/```json/gi, '').replace(/```/g, '').trim()

  // 1. Try parsing JSON array directly
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) {
    const raw = t.slice(start, end + 1)
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch (e) {
      try {
        const fixed = raw.replace(/,\s*([}\]])/g, '$1')
        const parsed = JSON.parse(fixed)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      } catch (e2) {
        // Continue to fallback parsers
      }
    }
  }

  // 2. Fallback: Extract individual JSON objects with "style" and "text"
  const objects = []
  const objRegex = /\{[\s\S]*?"style"\s*:\s*"([^"]+)"[\s\S]*?"text"\s*:\s*"([^"]+)"[\s\S]*?\}/gi
  let match
  while ((match = objRegex.exec(t)) !== null) {
    objects.push({ style: match[1], text: match[2].replace(/\\"/g, '"').trim() })
  }
  if (objects.length > 0) return objects

  // 3. Fallback: Parse markdown or numbered list
  const lines = t.split('\n')
  const extracted = []
  let curStyle = ''
  let curText = ''

  for (const line of lines) {
    const l = line.trim()
    const headerMatch = l.match(/^(?:(?:\d+|\*|-)\s*)?(?:\*\*)?(Natural & Concise|Detailed & Experience-Focused|Warm & Conversational|Concise|Detailed|Warm|Option\s*\d+)(?:\*\*)?[:\s-]+(.*)$/i)
    if (headerMatch) {
      if (curText.trim()) {
        extracted.push({ style: curStyle || 'Natural & Concise', text: curText.trim() })
      }
      curStyle = headerMatch[1]
      curText = headerMatch[2] ? headerMatch[2].replace(/^["']|["']$/g, '').trim() : ''
    } else if (curStyle && l && !l.startsWith('#')) {
      curText += ' ' + l.replace(/^["']|["']$/g, '').trim()
    }
  }
  if (curText.trim()) {
    extracted.push({ style: curStyle || 'Warm & Conversational', text: curText.trim() })
  }
  if (extracted.length > 0) return extracted

  return null
}

const DRAFT_STYLES = [
  { key: 'concise', label: 'Natural & Concise' },
  { key: 'detailed', label: 'Detailed & Experience-Focused' },
  { key: 'warm', label: 'Warm & Conversational' },
]

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function buildFallbackDrafts(campaign, experiences = [], customerText = '') {
  const biz = campaign.businessName || 'this business'
  const city = campaign.city ? ` in ${campaign.city}` : ''
  const expList = experiences.length ? experiences.join(', ') : 'great service'
  const note = customerText ? ` ${customerText.trim()}` : ''

  const concisePool = [
    `Had a wonderful experience at ${biz}${city}. Really impressed with the ${expList}!${note} Highly recommended.`,
    `Excellent visit to ${biz}${city}. The ${expList} truly stood out.${note} Will be recommending to everyone!`,
    `Top-notch experience with ${biz}${city}. Appreciated the ${expList} from start to finish.${note} 5 stars!`,
    `Great visit to ${biz}. Everything was handled smoothly, especially the ${expList}.${note} Thank you!`,
    `Very happy with my visit to ${biz}${city}. The focus on ${expList} made all the difference.${note}`,
  ]

  const detailedPool = [
    `Visited ${biz} recently and was genuinely pleased with my experience. The ${expList} stood out immediately.${note} The team was attentive and very professional throughout. Will definitely be returning!`,
    `I recently had an appointment at ${biz}${city} and cannot praise them enough. Their attention to ${expList} was evident throughout the entire visit.${note} Looking forward to coming back.`,
    `If you are looking for quality care in ${city || 'the area'}, ${biz} is the place to go. The ${expList} was second to none.${note} Truly appreciate the great service shown during my visit.`,
    `Very thorough and pleasant experience at ${biz}. You can tell they take immense pride in their ${expList}.${note} Everything went seamlessly from beginning to end!`,
    `My visit to ${biz}${city} was exceptional. The commitment to ${expList} made me feel valued as a customer.${note} Highly deserving of all five stars.`,
  ]

  const warmPool = [
    `So glad I visited ${biz}! Loved the ${expList}.${note} Thank you so much to the entire team for such good care. 5 stars all the way!`,
    `Such a warm and welcoming experience at ${biz}${city}! The ${expList} made my day so much easier.${note} Heartfelt thanks to everyone there!`,
    `Can't say enough good things about ${biz}! The ${expList} was fantastic and made me feel right at home.${note} Definitely coming back!`,
    `Big thank you to the wonderful team at ${biz}${city}! Loved the ${expList} and the personalized support.${note} 10/10 experience!`,
    `Truly grateful for the experience at ${biz}. Loved how caring and attentive they were, especially regarding ${expList}.${note} Thank you!`,
  ]

  return [
    {
      style: 'Natural & Concise',
      text: pickRandom(concisePool),
    },
    {
      style: 'Detailed & Experience-Focused',
      text: pickRandom(detailedPool),
    },
    {
      style: 'Warm & Conversational',
      text: pickRandom(warmPool),
    },
  ]
}

async function generateReviewDrafts(campaign, experiences = [], customerText = '') {
  const services = (campaign.services || []).join(', ')
  const expList = (experiences || []).join(', ')
  const nonce = Math.random().toString(36).slice(2, 7)

  const system = [
    'You help a real customer turn their genuine experience into an authentic, editable Google review draft.',
    'STRICT RULES:',
    '- Only use what the customer actually indicated. Never invent services, staff names, prices, discounts, guarantees, outcomes or experiences the customer did not mention.',
    '- Do NOT keyword-stuff. Do NOT repeat exact-match keywords unnaturally. Sound natural and human.',
    '- Naturally weave in the business name and city only where it reads naturally.',
    '- Keep it first-person, honest, and specific to the selected experience.',
    '- Never guarantee ratings or claim it improves rankings.',
    'Return ONLY a JSON array of exactly 3 objects, each: {"style": string, "text": string}. No prose, no markdown.',
  ].join('\n')

  const user = [
    `Business name: ${campaign.businessName || ''}`,
    `Category: ${campaign.category || ''}`,
    `City / Location: ${campaign.city || ''}`,
    services ? `Services: ${services}` : '',
    campaign.description ? `Business context: ${campaign.description}` : '',
    `Language: ${campaign.language || 'English'}`,
    '',
    `Customer selected these experiences: ${expList || '(none specified)'}`,
    customerText ? `Customer wrote (optional): "${customerText}"` : 'Customer left the optional note empty.',
    '',
    `Variation seed: ${nonce}`,
    'Produce exactly 3 DISTINCT, creative review drafts, genuinely different from each other:',
    '1) style "Natural & Concise" — short, 1-2 sentences.',
    '2) style "Detailed & Experience-Focused" — 3-4 sentences, focused on the experience.',
    '3) style "Warm & Conversational" — friendly and personable.',
    'Each draft must reflect the selected experiences and any customer text. Editable by the customer.',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const content = await callLLM([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], 0.9)

    let arr = extractJsonArray(content)
    if (!Array.isArray(arr) || arr.length === 0) {
      // one retry with stricter instruction
      const retry = await callLLM([
        { role: 'system', content: system },
        { role: 'user', content: user + '\n\nIMPORTANT: Output must be a raw JSON array only.' },
      ], 0.8)
      arr = extractJsonArray(retry)
    }
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.slice(0, 3).map((d, i) => ({
        style: d.style || DRAFT_STYLES[i]?.label || `Option ${i + 1}`,
        text: (d.text || '').trim(),
      }))
    }
  } catch (err) {
    console.warn('[AI:generateReviewDrafts] LLM call failed, using fallback drafts:', err.message)
    return buildFallbackDrafts(campaign, experiences, customerText)
  }

  return buildFallbackDrafts(campaign, experiences, customerText)
}

// ---------------------------------------------------------------------------
// Review Reply engine (AI) + review intelligence helpers
// ---------------------------------------------------------------------------
const TONE_GUIDE = {
  Professional: 'professional, courteous and polished',
  Friendly: 'friendly and approachable',
  Warm: 'warm, caring and heartfelt',
  Premium: 'refined, premium and gracious',
  Minimal: 'concise and to the point',
  Local: 'warm, local and community-oriented',
  Empathetic: 'empathetic and understanding',
}

function deriveSentiment(rating) {
  if (rating >= 4) return 'positive'
  if (rating === 3) return 'neutral'
  return 'negative'
}

const TOPIC_MAP = {
  staff: ['staff', 'team', 'doctor', 'therapist', 'dentist', 'barista', 'receptionist', 'people', 'employee'],
  'service quality': ['service', 'quality', 'professional', 'treatment', 'care', 'experience'],
  'waiting time': ['wait', 'waiting', 'quick', 'fast', 'slow', 'delay', 'time', 'prompt'],
  pricing: ['price', 'pricing', 'cost', 'expensive', 'affordable', 'value', 'money', 'worth'],
  cleanliness: ['clean', 'hygiene', 'tidy', 'spotless', 'comfortable', 'ambience', 'ambiance'],
  communication: ['communication', 'explained', 'listen', 'friendly', 'polite', 'rude', 'helpful'],
  'food & taste': ['coffee', 'food', 'taste', 'delicious', 'meal', 'pizza', 'dessert', 'menu'],
}

function detectTopics(text = '') {
  const t = String(text).toLowerCase()
  const found = []
  for (const [topic, kws] of Object.entries(TOPIC_MAP)) {
    if (kws.some((k) => t.includes(k))) found.push(topic)
  }
  return found.slice(0, 4)
}

function buildFallbackReply(campaign, review, tone = 'Professional') {
  const biz = campaign.businessName || 'our team'
  const reviewer = review.reviewerName ? review.reviewerName : 'valued customer'
  const rating = Number(review.rating) || 5

  if (rating >= 4) {
    if (tone === 'Friendly' || tone === 'Warm') {
      return `Hi ${reviewer}, thank you so much for the wonderful review and your kind words! We are delighted to know you had such a great experience with us. Looking forward to seeing you again soon! — The ${biz} Team`
    }
    return `Dear ${reviewer}, thank you for taking the time to share your feedback. We are truly pleased to hear that you had a positive experience with our services. We look forward to serving you again. Warm regards, ${biz}`
  } else if (rating <= 2) {
    return `Dear ${reviewer}, thank you for bringing this to our attention. We sincerely apologise that your experience did not meet expectations. We take this very seriously and would like to understand what happened and make things right. Please reach out to us directly so we can assist you. Sincerely, ${biz}`
  } else {
    return `Hello ${reviewer}, thank you for sharing your feedback. We appreciate your constructive input and are always striving to improve our services. We hope to deliver a 5-star experience on your next visit. Best regards, ${biz}`
  }
}

async function generateReviewReply(campaign, review, tone = 'Professional', length = 'standard') {
  const toneDesc = TONE_GUIDE[tone] || TONE_GUIDE.Professional
  const lenDesc =
    length === 'short' ? '1 short sentence' : length === 'detailed' ? '3-4 sentences' : '2 sentences'

  const system = [
    `You write the business OWNER's public reply to a Google review. Tone: ${toneDesc}.`,
    'STRICT RULES:',
    '- Address the reviewer by name if provided.',
    '- Thank positive reviewers; for negative reviews, apologise sincerely, take responsibility and invite them to make it right offline. Never be defensive.',
    '- Never invent facts, offers, discounts, guarantees or details not present in the business context or the review.',
    '- Do NOT keyword-stuff. Sound human and genuine.',
    '- Sign off naturally as the team/business where appropriate.',
    `- Length: about ${lenDesc}.`,
    'Return ONLY the reply text. No quotes, no preamble, no markdown.',
  ].join('\n')

  const user = [
    `Business: ${campaign.businessName || ''}${campaign.city ? `, ${campaign.city}` : ''}`,
    campaign.category ? `Category: ${campaign.category}` : '',
    (campaign.services || []).length ? `Services: ${(campaign.services || []).join(', ')}` : '',
    campaign.description ? `About: ${campaign.description}` : '',
    '',
    `Reviewer: ${review.reviewerName || 'A customer'}`,
    `Rating: ${review.rating} / 5`,
    `Review: "${review.text}"`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const content = await callLLM(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      0.7
    )
    const replyText = String(content || '').replace(/^["']|["']$/g, '').trim()
    return replyText || buildFallbackReply(campaign, review, tone)
  } catch (err) {
    console.warn('[AI:generateReviewReply] LLM call failed, using fallback:', err.message)
    return buildFallbackReply(campaign, review, tone)
  }
}

const DEMO_REVIEWS = [
  { reviewerName: 'Ananya Sharma', rating: 5, text: 'Absolutely wonderful experience. The staff were friendly and professional, and I felt genuinely cared for throughout.' },
  { reviewerName: 'Rohit Verma', rating: 5, text: 'Quick service and great quality. Highly recommend to anyone in the area.' },
  { reviewerName: 'Priya Nair', rating: 4, text: 'Really good overall. The team was helpful, though the waiting time was a little longer than expected.' },
  { reviewerName: 'Karan Mehta', rating: 3, text: 'Decent experience. Service was okay but I felt the pricing was a bit on the higher side.' },
  { reviewerName: 'Sneha Iyer', rating: 5, text: 'Clean, comfortable and very welcoming. The staff explained everything clearly. Will visit again!' },
  { reviewerName: 'Aditya Rao', rating: 2, text: 'Disappointed with the long wait and the communication could have been much better.' },
  { reviewerName: 'Meera Joshi', rating: 5, text: 'Fantastic! Professional team and excellent value for money. Thank you!' },
  { reviewerName: 'Vikram Singh', rating: 4, text: 'Good service and friendly staff. A pleasant experience overall.' },
  { reviewerName: 'Fatima Khan', rating: 1, text: 'Not happy with my visit. Felt rushed and the issue was not resolved properly.' },
  { reviewerName: 'Deepak Kumar', rating: 5, text: 'One of the best in the city. Everything was quick, clean and handled with great care.' },
  { reviewerName: 'Neha Gupta', rating: 4, text: 'Really liked the ambience and the helpful staff. Would come back.' },
  { reviewerName: 'Arjun Desai', rating: 3, text: 'Average experience. Some things were great, others could improve.' },
]

function buildDemoReviewsForCampaign(campaign) {
  const now = Date.now()
  const count = 8 + Math.floor(Math.random() * 5)
  const pool = [...DEMO_REVIEWS].sort(() => Math.random() - 0.5).slice(0, count)
  return pool.map((r, i) => ({
    id: uuidv4(),
    campaignId: campaign.id,
    orgId: campaign.orgId,
    businessName: campaign.businessName,
    reviewerName: r.reviewerName,
    rating: r.rating,
    text: r.text,
    sentiment: deriveSentiment(r.rating),
    topics: detectTopics(r.text),
    replyStatus: 'unanswered',
    reply: '',
    replyTone: '',
    source: 'demo',
    createdAt: new Date(now - i * 36 * 3600 * 1000),
    updatedAt: new Date(),
  }))
}

function buildOneDemoReview(campaign) {
  const r = DEMO_REVIEWS[Math.floor(Math.random() * DEMO_REVIEWS.length)]
  return {
    id: uuidv4(),
    campaignId: campaign.id,
    orgId: campaign.orgId,
    businessName: campaign.businessName,
    reviewerName: r.reviewerName,
    rating: r.rating,
    text: r.text,
    sentiment: deriveSentiment(r.rating),
    topics: detectTopics(r.text),
    replyStatus: 'unanswered',
    reply: '',
    replyTone: '',
    autoHandled: false,
    autoAction: null,
    source: 'demo',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// Automated reply engine: generate AI reply, then either auto-publish (only
// high-star POSITIVE reviews) or send to the approval queue. Negatives/neutrals
// are NEVER auto-published — safety first.
async function applyAutomation(db, campaign, review) {
  const cfg = campaign.automation || {}
  const tone = cfg.tone || 'Friendly'
  const length = cfg.length || 'standard'
  const minR = cfg.autoPublishMinRating || 5

  let reply = ''
  try {
    reply = await generateReviewReply(campaign, review, tone, length)
  } catch (e) {
    reply = ''
  }

  const canAuto = !!cfg.enabled && !!reply && review.rating >= minR && review.rating >= 4 && review.sentiment === 'positive'

  const set = { reply, replyTone: tone, autoHandled: true, updatedAt: new Date() }
  if (canAuto) {
    set.replyStatus = 'published'
    set.publishedAt = new Date()
    set.autoAction = 'auto_published'
  } else {
    set.replyStatus = 'draft'
    set.autoAction = 'queued'
  }
  await db.collection('reviews').updateOne({ id: review.id }, { $set: set })
  return { ...review, ...set }
}

async function reviewStats(db, filter = {}) {
  const all = await db.collection('reviews').find(filter).toArray()
  const total = all.length
  const unanswered = all.filter((r) => r.replyStatus !== 'published').length
  const published = all.filter((r) => r.replyStatus === 'published').length
  const avg = total ? all.reduce((s, r) => s + (r.rating || 0), 0) / total : 0
  return {
    total,
    unanswered,
    published,
    avgRating: Math.round(avg * 10) / 10,
    responseRate: total ? Math.round((published / total) * 100) : 0,
  }
}

// ---------------------------------------------------------------------------
// Local SEO Audit & Optimization Scorecard
// ---------------------------------------------------------------------------
function extractJsonObject(text) {
  if (!text) return null
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch (e) {
    return null
  }
}

function gradeFor(score) {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}

function computeProfileCompleteness(p) {
  const services = Array.isArray(p.services) ? p.services : []
  const checks = [
    { key: 'businessName', label: 'Business name set', ok: !!(p.businessName && String(p.businessName).trim()), weight: 5 },
    { key: 'category', label: 'Primary category set', ok: !!(p.category && String(p.category).trim()), weight: 12 },
    { key: 'city', label: 'Location / service area set', ok: !!(p.city && String(p.city).trim()), weight: 10 },
    { key: 'services', label: 'At least 3 services listed', ok: services.length >= 3, weight: 13 },
    { key: 'description', label: 'Rich description (80+ chars)', ok: (p.description || '').trim().length >= 80, weight: 15 },
    { key: 'googleReviewUrl', label: 'Google review link connected', ok: !!(p.googleReviewUrl && String(p.googleReviewUrl).trim()), weight: 10 },
    { key: 'website', label: 'Website URL added', ok: !!(p.website && String(p.website).trim()), weight: 10 },
    { key: 'phone', label: 'Phone number added', ok: !!(p.phone && String(p.phone).trim()), weight: 10 },
    { key: 'hours', label: 'Business hours set', ok: !!p.hasHours, weight: 7 },
    { key: 'photos', label: '3+ photos uploaded', ok: (Number(p.photoCount) || 0) >= 3, weight: 8 },
  ]
  const total = checks.reduce((s, c) => s + c.weight, 0)
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0)
  return { score: Math.round((got / total) * 100), checks: checks.map(({ key, label, ok }) => ({ key, label, ok })) }
}

function computeReviewReputation(sig) {
  if (!sig || !sig.reviewCount) {
    return { score: 12, detail: 'No reviews yet — this is your biggest opportunity to build local trust.' }
  }
  const ratingScore = (sig.avgRating / 5) * 100
  const volumeScore = Math.min(sig.reviewCount / 25, 1) * 100
  const responseScore = sig.responseRate || 0
  const recencyScore = Math.min((sig.recentCount || 0) / 5, 1) * 100
  const score = Math.round(ratingScore * 0.5 + volumeScore * 0.25 + responseScore * 0.15 + recencyScore * 0.1)
  return { score, detail: `${sig.avgRating.toFixed(1)}★ across ${sig.reviewCount} reviews · ${sig.responseRate}% owner-response rate.` }
}

function computeEngagement(an, sig) {
  if (!an || !an.landing_view) {
    const rr = sig && sig.reviewCount ? sig.responseRate : 0
    return { score: Math.max(10, Math.round(rr * 0.5)), detail: 'Limited engagement data — launch a QR review campaign to drive activity.' }
  }
  const rates = an.rates || {}
  const avgRates = ((rates.draftGenerationRate || 0) + (rates.copyRate || 0) + (rates.googleRedirectRate || 0)) / 3
  const volumeFactor = Math.min((an.landing_view || 0) / 50, 1) * 100
  const score = Math.round(avgRates * 0.6 + volumeFactor * 0.4)
  return { score, detail: `${an.landing_view} campaign views · ${rates.googleRedirectRate || 0}% reach Google.` }
}

function buildFallbackAuditAI(profile, sig, completeness) {
  const biz = profile.businessName || 'Business'
  const city = profile.city || 'your area'
  const cat = profile.category || 'Local Service'
  const gaps = (completeness?.checks || []).filter((c) => !c.ok).map((c) => c.label)

  const recs = []
  if (gaps.includes('Rich description (80+ chars)')) {
    recs.push({
      title: 'Expand business description with local keywords',
      category: 'Profile',
      impact: 'high',
      effort: 'low',
      why: 'A detailed profile description helps Google understand your services and ranks you higher in local search results.',
      howTo: `Add a 500+ character description mentioning ${biz}, ${cat} in ${city}, and key services.`,
    })
  }
  if (gaps.includes('At least 3 services listed')) {
    recs.push({
      title: 'List all specific services offered',
      category: 'Profile',
      impact: 'high',
      effort: 'low',
      why: 'Google ranks profiles higher when specific service tags match user search queries.',
      howTo: 'Navigate to Services in your Google Business Profile and add all treatments or products you offer.',
    })
  }
  recs.push({
    title: 'Actively generate fresh customer reviews',
    category: 'Reviews',
    impact: 'high',
    effort: 'low',
    why: 'Recent reviews are the #1 local ranking factor and significantly boost conversion rate.',
    howTo: 'Share your niuronai QR code or direct review link with every customer right after service.',
  })
  recs.push({
    title: 'Reply to all Google reviews within 24 hours',
    category: 'Engagement',
    impact: 'medium',
    effort: 'low',
    why: 'Google officially states that responding to reviews improves your local SEO ranking and customer trust.',
    howTo: 'Use the Reviews inbox in niuronai with 1-click AI replies to respond to every customer.',
  })
  recs.push({
    title: 'Add high-quality photos regularly',
    category: 'Content',
    impact: 'medium',
    effort: 'medium',
    why: 'Businesses with 10+ photos get 42% more direction requests on Google Maps.',
    howTo: 'Upload clear photos of your clinic/store interior, exterior, team, and equipment weekly.',
  })

  return {
    keywordsSeoScore: (completeness?.score || 50) > 70 ? 78 : 58,
    summary: `${biz} has a solid foundation in ${city}. Focusing on complete profile fields, regular photo updates, and rapid review responses will drive strong local ranking improvements.`,
    recommendations: recs,
    optimizedDescription: `${biz} is a dedicated ${cat} serving ${city}. Committed to exceptional customer service, professional care, and quality results. Contact or visit us today in ${city}.`,
    suggestedCategories: [cat, `${cat} Clinic`, 'Health & Medical'],
    suggestedKeywords: [`best ${cat.toLowerCase()} in ${city}`, `${cat.toLowerCase()} near me`, `${biz} ${city}`],
  }
}

async function generateAuditAI(profile, sig, completeness) {
  const services = (profile.services || []).join(', ')
  const gaps = (completeness.checks || []).filter((c) => !c.ok).map((c) => c.label)
  const system = [
    'You are a senior Local SEO consultant auditing a Google Business Profile.',
    'You produce practical, specific, non-generic recommendations that improve local search ranking and review conversion.',
    'STRICT RULES:',
    '- Base advice only on the provided context. Never invent facts about the business.',
    '- Recommendations must be concrete and actionable, tailored to this exact business category and city.',
    '- Never recommend anything against Google guidelines (no fake reviews, no keyword stuffing, no incentivised reviews).',
    'Return ONLY a JSON object (no markdown, no prose) with this exact shape:',
    '{',
    '  "keywordsSeoScore": number (0-100 — how well the current description + services + category target local-intent search keywords),',
    '  "summary": string (2-3 sentence executive summary of overall profile health),',
    '  "recommendations": [ { "title": string, "category": "Profile"|"Reviews"|"Keywords"|"Engagement"|"Content", "impact": "high"|"medium"|"low", "effort": "low"|"medium"|"high", "why": string, "howTo": string } ]  (6 to 9 items, most impactful first),',
    '  "optimizedDescription": string (a rewritten 500-750 character Google Business description — natural, locally keyword-aware, NOT keyword-stuffed),',
    '  "suggestedCategories": [string] (3-5 relevant Google Business categories, primary first),',
    '  "suggestedKeywords": [string] (8-12 local search phrases to target, e.g. "physiotherapist in <city>")',
    '}',
  ].join('\n')

  const user = [
    `Business name: ${profile.businessName || ''}`,
    `Category: ${profile.category || '(not set)'}`,
    `City / service area: ${profile.city || '(not set)'}`,
    services ? `Services: ${services}` : 'Services: (none listed)',
    `Current description: ${profile.description ? `"${profile.description}"` : '(empty)'}`,
    `Website: ${profile.website ? 'present' : 'MISSING'} · Phone: ${profile.phone ? 'present' : 'MISSING'} · Hours: ${profile.hasHours ? 'set' : 'MISSING'} · Photos: ${Number(profile.photoCount) || 0}`,
    `Google review link connected: ${profile.googleReviewUrl ? 'yes' : 'no'}`,
    sig && sig.reviewCount
      ? `Reviews: ${sig.avgRating.toFixed(1)}-star average across ${sig.reviewCount} reviews, ${sig.responseRate}% owner-response rate, ${sig.recentCount} in the last 30 days, ${sig.negativeCount} negative.`
      : 'Reviews: none yet.',
    `Profile completeness gaps: ${gaps.length ? gaps.join('; ') : 'none'}`,
    '',
    'Audit this profile and return the JSON object described above.',
  ].filter(Boolean).join('\n')

  try {
    const content = await callLLM([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], 0.6)

    let obj = extractJsonObject(content)
    if (!obj) {
      const retry = await callLLM([
        { role: 'system', content: system },
        { role: 'user', content: user + '\n\nIMPORTANT: Output a raw JSON object only.' },
      ], 0.5)
      obj = extractJsonObject(retry)
    }
    if (obj) return obj
  } catch (err) {
    console.warn('[AI:generateAuditAI] LLM call failed, using fallback audit:', err.message)
    return buildFallbackAuditAI(profile, sig, completeness)
  }
  return buildFallbackAuditAI(profile, sig, completeness)
}

async function runAudit(db, profile, campaignId, orgId) {
  // normalize services to an array (manual entry may pass a comma string)
  if (!Array.isArray(profile.services)) {
    profile.services = String(profile.services || '').split(',').map((s) => s.trim()).filter(Boolean)
  }
  let sig = null
  let an = null
  if (campaignId) {
    const stats = await reviewStats(db, { campaignId })
    const all = await db.collection('reviews').find({ campaignId }).toArray()
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000
    sig = {
      avgRating: stats.avgRating || 0,
      reviewCount: stats.total,
      responseRate: stats.responseRate,
      negativeCount: all.filter((r) => (r.sentiment || deriveSentiment(r.rating)) === 'negative').length,
      recentCount: all.filter((r) => new Date(r.createdAt).getTime() >= cutoff).length,
    }
    an = await analyticsFor(db, campaignId)
  } else if (profile.avgRating || profile.reviewCount) {
    sig = {
      avgRating: Number(profile.avgRating) || 0,
      reviewCount: Number(profile.reviewCount) || 0,
      responseRate: Number(profile.responseRate) || 0,
      negativeCount: 0,
      recentCount: 0,
    }
  }

  const completeness = computeProfileCompleteness(profile)
  const reputation = computeReviewReputation(sig)
  const engagement = computeEngagement(an, sig)
  const ai = await generateAuditAI(profile, sig, completeness)

  const keywordsSeo = Math.max(0, Math.min(100, Math.round(Number(ai.keywordsSeoScore) || 0)))

  const W = { profileCompleteness: 0.3, reviewsReputation: 0.3, keywordsSeo: 0.2, engagement: 0.2 }
  const overall = Math.round(
    completeness.score * W.profileCompleteness +
    reputation.score * W.reviewsReputation +
    keywordsSeo * W.keywordsSeo +
    engagement.score * W.engagement
  )

  const recommendations = (Array.isArray(ai.recommendations) ? ai.recommendations : []).slice(0, 9).map((r) => ({
    id: uuidv4(),
    title: String(r.title || '').trim(),
    category: r.category || 'Profile',
    impact: ['high', 'medium', 'low'].includes(r.impact) ? r.impact : 'medium',
    effort: ['low', 'medium', 'high'].includes(r.effort) ? r.effort : 'medium',
    why: String(r.why || '').trim(),
    howTo: String(r.howTo || '').trim(),
  })).filter((r) => r.title)

  const audit = {
    id: uuidv4(),
    campaignId: campaignId || null,
    orgId: orgId || null,
    businessName: profile.businessName || 'My Business',
    category: profile.category || '',
    city: profile.city || '',
    services: Array.isArray(profile.services)
      ? profile.services
      : String(profile.services || '').split(',').map((s) => s.trim()).filter(Boolean),
    description: profile.description || '',
    profile: {
      website: profile.website || '',
      phone: profile.phone || '',
      hasHours: !!profile.hasHours,
      photoCount: Number(profile.photoCount) || 0,
      googleReviewUrl: profile.googleReviewUrl || '',
    },
    overallScore: overall,
    grade: gradeFor(overall),
    categories: {
      profileCompleteness: { label: 'Profile Completeness', score: completeness.score, weight: W.profileCompleteness, checks: completeness.checks, detail: `${completeness.checks.filter((c) => c.ok).length}/${completeness.checks.length} profile fields complete.` },
      reviewsReputation: { label: 'Reviews & Reputation', score: reputation.score, weight: W.reviewsReputation, detail: reputation.detail },
      keywordsSeo: { label: 'Keywords & SEO', score: keywordsSeo, weight: W.keywordsSeo, detail: 'How well your content targets local search intent.' },
      engagement: { label: 'Engagement', score: engagement.score, weight: W.engagement, detail: engagement.detail },
    },
    reviewSignals: sig,
    aiSummary: String(ai.summary || '').trim(),
    recommendations,
    optimizedDescription: String(ai.optimizedDescription || '').trim(),
    suggestedCategories: Array.isArray(ai.suggestedCategories) ? ai.suggestedCategories.slice(0, 6) : [],
    suggestedKeywords: Array.isArray(ai.suggestedKeywords) ? ai.suggestedKeywords.slice(0, 14) : [],
    createdAt: new Date(),
  }
  await db.collection('audits').insertOne(audit)
  return audit
}


// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_BUTTONS = [
  'Great Service',
  'Friendly Staff',
  'Professional Team',
  'Quick Service',
  'Quality Service',
  'Clean & Comfortable',
  'Value for Money',
  'Highly Satisfied',
].map((label) => ({ id: uuidv4(), label, enabled: true }))

function buildCampaign(body) {
  const now = new Date()
  const base = slugify(body.businessName)
  return {
    id: uuidv4(),
    slug: `${base || 'biz'}-${Math.random().toString(36).slice(2, 7)}`,
    businessName: body.businessName || 'My Business',
    category: body.category || '',
    city: body.city || '',
    services: Array.isArray(body.services)
      ? body.services
      : String(body.services || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    description: body.description || '',
    headline: body.headline || 'How was your experience?',
    subheadline: body.subheadline || 'Tap what you loved and we will help you write a quick review.',
    ctaText: body.ctaText || 'Copy & Paste to Google',
    primaryColor: body.primaryColor || '#6d28d9',
    secondaryColor: body.secondaryColor || '#4f46e5',
    logoUrl: body.logoUrl || '',
    experienceButtons:
      Array.isArray(body.experienceButtons) && body.experienceButtons.length
        ? body.experienceButtons
        : DEFAULT_BUTTONS.map((b) => ({ ...b, id: uuidv4() })),
    allowMultiSelect: body.allowMultiSelect !== false,
    textFieldEnabled: body.textFieldEnabled !== false,
    maxTextLength: body.maxTextLength || 500,
    draftCount: body.draftCount || 3,
    language: body.language || 'English',
    googleReviewUrl: body.googleReviewUrl || '',
    status: body.status || 'active',
    automation: {
      enabled: body.automation?.enabled || false,
      autoPublishMinRating: body.automation?.autoPublishMinRating || 5,
      tone: body.automation?.tone || 'Friendly',
      length: body.automation?.length || 'standard',
    },
    createdAt: now,
    updatedAt: now,
  }
}

async function trackEvent(db, campaign, type, body = {}) {
  const ev = {
    id: uuidv4(),
    campaignId: campaign.id,
    slug: campaign.slug,
    type,
    sessionId: body.sessionId || 'anon',
    meta: body.meta || {},
    createdAt: new Date(),
  }
  await db.collection('events').insertOne(ev)
  return ev
}

async function analyticsFor(db, campaignId) {
  const rows = await db
    .collection('events')
    .aggregate([
      { $match: { campaignId } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ])
    .toArray()
  const counts = {}
  rows.forEach((r) => (counts[r._id] = r.count))
  const sessions = await db.collection('events').distinct('sessionId', { campaignId })
  const views = counts['landing_view'] || 0
  const generated = counts['draft_generated'] || 0
  const copies = counts['copy_success'] || 0
  const redirects = counts['google_redirect_clicked'] || 0
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
  return {
    landing_view: views,
    unique_visitors: sessions.filter((s) => s && s !== 'anon').length || sessions.length,
    experience_selected: counts['experience_selected'] || 0,
    draft_generated: generated,
    draft_selected: counts['draft_selected'] || 0,
    copy_clicked: counts['copy_clicked'] || 0,
    copy_success: copies,
    google_redirect_clicked: redirects,
    rates: {
      draftGenerationRate: pct(generated, views),
      copyRate: pct(copies, generated),
      googleRedirectRate: pct(redirects, copies),
    },
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
// Idempotently activate a paid subscription for a local order and issue an
// invoice. Safe to call from both /billing/confirm and the Razorpay webhook.
async function fulfillOrder(db, order, { gateway, gatewayRef } = {}) {
  if (!order) return { ok: false, error: 'Order not found' }
  if (order.status === 'paid') return { ok: true, alreadyPaid: true }
  const org = await db.collection('organizations').findOne({ id: order.orgId })
  const plan = await db.collection('plans').findOne({ id: order.planId })
  if (!org || !plan) return { ok: false, error: 'Order org/plan missing' }
  const coupon = order.couponCode ? await db.collection('coupons').findOne({ code: order.couponCode }) : null
  const result = await activatePaidSubscription(db, {
    org, plan, interval: order.interval, currency: order.currency, totals: order.totals,
    coupon: coupon ? { id: coupon.id, code: coupon.code } : null, gateway: gateway || order.gateway,
    gatewayRef, userId: order.userId || null,
  })
  await db.collection('orders').updateOne({ id: order.id }, { $set: { status: 'paid', paidAt: new Date(), gatewayPaymentId: gatewayRef || null } })
  await notify(db, org.id, order.userId || null, 'subscription_active', `You're on the ${plan.name} plan`, `Payment received. Your ${plan.name} plan is active until ${result.periodEnd.toDateString()}.`)
  const payingUser = order.userId ? await db.collection('users').findOne({ id: order.userId }) : await db.collection('users').findOne({ id: org.ownerUserId })
  if (payingUser?.email) {
    sendInvoiceEmail({ email: payingUser.email, name: payingUser.name, invoice: result.invoice, plan }).catch((e) => console.error('[MAIL:invoice] error', e))
  }
  return { ok: true, invoice: result.invoice, planName: plan.name }
}

async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method
  const redirect = (pathAndQuery) => redirectTo(pathAndQuery, request)

  try {
    const db = await connectToMongo()
    await ensureDefaults(db)
    const auth = await getAuthContext(request)

    // Health
    if ((route === '/' || route === '/root') && method === 'GET') {
      return json({ ok: true, app: 'niuronai', model: LLM_MODEL })
    }

    // AI Status / Diagnostics (Verify LLM key & connectivity)
    if (route === '/ai-status' && method === 'GET') {
      const envEmergent = process.env.EMERGENT_LLM_KEY || ''
      const hasOpenRouter = !!(process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || envEmergent.startsWith('sk-or-') || envEmergent.startsWith('sk-'))
      const hasGemini = !!(process.env.GEMINI_API_KEY || envEmergent.startsWith('AIzaSy'))
      const hasEmergent = !!(envEmergent && !envEmergent.startsWith('AIzaSy') && !envEmergent.startsWith('sk-or-') && !envEmergent.startsWith('sk-'))

      let testOutput = null
      let testError = null
      try {
        testOutput = await callLLM([{ role: 'user', content: 'Say hello in 3 words' }], 0.7)
      } catch (e) {
        testError = e.message || String(e)
      }

      return json({
        ok: !testError,
        providersConfigured: {
          openrouter: hasOpenRouter,
          gemini: hasGemini,
          emergent: hasEmergent,
        },
        model: process.env.OPENROUTER_MODEL || 'openrouter/free',
        liveAiWorking: !!testOutput,
        testResponse: testOutput ? testOutput.trim() : null,
        error: testError,
      })
    }

    // ==================== AUTH ====================
    if (route === '/auth/register' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      if (!email || !/.+@.+\..+/.test(email)) return json({ error: 'A valid email is required' }, 400)
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)
      const existing = await db.collection('users').findOne({ email })
      if (existing) return json({ error: 'An account with this email already exists' }, 409)
      const passwordHash = await hashPassword(password)

      // Check for pending team invite
      const inviteQuery = []
      if (body.inviteToken) inviteQuery.push({ token: String(body.inviteToken).trim() })
      if (email) inviteQuery.push({ email })
      const invite = await db.collection('teamInvites').findOne({ $or: inviteQuery })

      let user, org
      if (invite && new Date(invite.expiresAt) > new Date()) {
        const targetOrg = await db.collection('organizations').findOne({ id: invite.orgId })
        if (targetOrg) {
          const now = new Date()
          const userId = uuidv4()
          user = {
            id: userId,
            email,
            name: body.name || email.split('@')[0],
            passwordHash,
            role: invite.role || 'member',
            orgId: targetOrg.id,
            status: 'active',
            createdAt: now,
            lastLoginAt: now,
          }
          await db.collection('users').insertOne(user)
          await db.collection('memberships').insertOne({
            id: uuidv4(),
            orgId: targetOrg.id,
            userId,
            role: invite.role || 'member',
            createdAt: now,
          })
          await db.collection('teamInvites').deleteOne({ id: invite.id })
          org = targetOrg
          await notify(db, targetOrg.id, userId, 'team_joined', `${user.name || user.email} joined the workspace`, `Role: ${invite.role}`)
        }
      }

      if (!user) {
        const prov = await provisionSignup(db, { email, name: body.name, passwordHash })
        user = prov.user
        org = prov.org
        await notify(db, org.id, user.id, 'welcome', 'Welcome to niuronai', 'Your workspace is ready. Start by creating a review campaign.')
        sendWelcomeEmail({ email: user.email, name: user.name }).catch((e) => console.error('[MAIL:welcome] error', e))
      }

      const token = signToken({ uid: user.id, orgId: org.id })
      const ent = await getEntitlements(db, org.id)
      const res = json({ user: clean({ ...user, passwordHash: undefined }), org, entitlements: ent })
      res.headers.append('Set-Cookie', serializeSession(token))
      return res
    }

    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = String(body.email || '').trim().toLowerCase()
      const user = await db.collection('users').findOne({ email })
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        return json({ error: 'Invalid email or password' }, 401)
      }
      if (user.status === 'suspended') return json({ error: 'This account is suspended. Contact support.' }, 403)
      await db.collection('users').updateOne({ id: user.id }, { $set: { lastLoginAt: new Date() } })
      const token = signToken({ uid: user.id, orgId: user.orgId })
      const org = user.orgId ? clean(await db.collection('organizations').findOne({ id: user.orgId })) : null
      const ent = org ? await getEntitlements(db, org.id) : null
      const res = json({ user: clean({ ...user, passwordHash: undefined }), org, entitlements: ent, role: user.role })
      res.headers.append('Set-Cookie', serializeSession(token))
      return res
    }

    if (route === '/auth/logout' && method === 'POST') {
      const res = json({ ok: true })
      res.headers.append('Set-Cookie', serializeClear())
      return res
    }

    if (route === '/auth/me' && method === 'GET') {
      if (!auth) return json({ user: null })
      const ent = auth.org ? await getEntitlements(db, auth.org.id) : null
      return json({ user: { ...auth.user, passwordHash: undefined }, org: auth.org, entitlements: ent, role: auth.user.role })
    }

    if (route === '/auth/profile' && method === 'PATCH') {
      if (!auth?.user) return json({ error: 'unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const update = { updatedAt: new Date() }
      if (typeof body.name === 'string') update.name = body.name.trim()
      if (typeof body.avatar === 'string') update.avatar = body.avatar.trim()
      await db.collection('users').updateOne({ id: auth.user.id }, { $set: update })
      const updated = await db.collection('users').findOne({ id: auth.user.id })
      return json({ user: clean({ ...updated, passwordHash: undefined }) })
    }

    if (route === '/auth/change-password' && method === 'POST') {
      if (!auth?.user) return json({ error: 'unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const currentPassword = String(body.currentPassword || '')
      const newPassword = String(body.newPassword || '')
      if (!newPassword || newPassword.length < 6) {
        return json({ error: 'New password must be at least 6 characters' }, 400)
      }
      const user = await db.collection('users').findOne({ id: auth.user.id })
      if (user.passwordHash) {
        if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
          return json({ error: 'Current password is incorrect' }, 400)
        }
      }
      const passwordHash = await hashPassword(newPassword)
      await db.collection('users').updateOne({ id: auth.user.id }, { $set: { passwordHash, updatedAt: new Date() } })
      return json({ ok: true, message: 'Password updated successfully' })
    }

    // ==================== GOOGLE OAUTH (login) ====================
    if (route === '/auth/config' && method === 'GET') {
      return json({ googleEnabled: googleEnabled() })
    }

    if (route === '/auth/google' && method === 'GET') {
      if (!googleEnabled()) return json({ error: 'Google login is not configured' }, 400)
      const state = signOAuthState({ type: 'login' })
      const url = buildAuthUrl({ scope: LOGIN_SCOPE, redirectUri: loginRedirectUri(request), state })
      const r = handleCORS(NextResponse.redirect(url))
      r.headers.append('Set-Cookie', stateCookie('oauth_login_state', state))
      return r
    }

    if (route === '/auth/google/callback' && method === 'GET') {
      const q = request.nextUrl.searchParams
      if (q.get('error')) return redirect('/login?error=google_denied')
      const state = q.get('state')
      const verified = verifyOAuthState(state)
      const saved = readReqCookie(request, 'oauth_login_state')
      const isValid = (verified && verified.type === 'login') || (state && saved && state === saved)
      if (!isValid) return redirect('/login?error=state')
      try {
        const tok = await exchangeCode(q.get('code'), loginRedirectUri(request))
        const info = await getUserInfo(tok.access_token)
        if (!info.email || info.email_verified !== true) return redirect('/login?error=email_unverified')
        const email = String(info.email).toLowerCase()
        const users = db.collection('users')
        let user = await users.findOne({ googleId: info.sub }) || await users.findOne({ email })
        if (user) {
          await users.updateOne({ id: user.id }, { $set: { googleId: info.sub, avatar: info.picture || user.avatar || '', lastLoginAt: new Date() } })
        } else {
          // Check for pending team invite
          const invite = await db.collection('teamInvites').findOne({ email })
          const targetOrg = invite && new Date(invite.expiresAt) > new Date()
            ? await db.collection('organizations').findOne({ id: invite.orgId })
            : null

          if (targetOrg && invite) {
            const now = new Date()
            const userId = uuidv4()
            user = {
              id: userId,
              email,
              name: info.name || email.split('@')[0],
              passwordHash: null,
              googleId: info.sub,
              avatar: info.picture || '',
              role: invite.role || 'member',
              orgId: targetOrg.id,
              status: 'active',
              createdAt: now,
              lastLoginAt: now,
            }
            await users.insertOne(user)
            await db.collection('memberships').insertOne({
              id: uuidv4(),
              orgId: targetOrg.id,
              userId,
              role: invite.role || 'member',
              createdAt: now,
            })
            await db.collection('teamInvites').deleteOne({ id: invite.id })
            await notify(db, targetOrg.id, userId, 'team_joined', `${user.name || user.email} joined the workspace`, `Role: ${invite.role}`)
          } else {
            const prov = await provisionSignup(db, { email, name: info.name || '', passwordHash: null, googleId: info.sub, avatar: info.picture || '' })
            user = prov.user
            await notify(db, prov.org.id, user.id, 'welcome', 'Welcome to niuronai', 'Your workspace is ready. Start by creating a review campaign.')
          }
        }
        const token = signToken({ uid: user.id, orgId: user.orgId })
        const r = redirect('/dashboard')
        r.headers.append('Set-Cookie', serializeSession(token))
        r.headers.append('Set-Cookie', stateCookie('oauth_login_state', '', 0))
        return r
      } catch (e) {
        return redirect('/login?error=google_failed')
      }
    }

    // ==================== GOOGLE BUSINESS PROFILE (connect) ====================
    if (route === '/gbp/connect' && method === 'GET') {
      if (!auth?.org) return redirect('/login?next=/account')
      if (!googleEnabled()) return json({ error: 'Google is not configured' }, 400)
      const state = signOAuthState({ orgId: auth.org.id, userId: auth.user.id, type: 'gbp' })
      const url = buildAuthUrl({ scope: GBP_SCOPE, redirectUri: gbpRedirectUri(request), state, offline: true })
      const r = handleCORS(NextResponse.redirect(url))
      r.headers.append('Set-Cookie', stateCookie('oauth_gbp_state', state))
      return r
    }

    if (route === '/gbp/callback' && method === 'GET') {
      const q = request.nextUrl.searchParams
      if (q.get('error')) return redirect('/account?gbp=denied')
      const state = q.get('state')
      const verified = verifyOAuthState(state)
      const saved = readReqCookie(request, 'oauth_gbp_state')
      const isValid = (verified && verified.type === 'gbp') || (state && saved && state === saved)
      if (!isValid) return redirect('/account?gbp=state')

      const targetOrgId = auth?.org?.id || verified?.orgId
      const targetUserId = auth?.user?.id || verified?.userId
      if (!targetOrgId || !targetUserId) return redirect('/login?next=/account')

      try {
        const tok = await exchangeCode(q.get('code'), gbpRedirectUri(request))
        // Preserve an existing refresh token if Google omits one on re-consent.
        const existing = await db.collection('gbpConnections').findOne({ orgId: targetOrgId })
        const refreshSealed = tok.refresh_token ? sealToken(tok.refresh_token) : existing?.refreshTokenEnc
        if (!refreshSealed) return redirect('/account?gbp=norefresh')
        await db.collection('gbpConnections').updateOne(
          { orgId: targetOrgId },
          { $set: { orgId: targetOrgId, userId: targetUserId, refreshTokenEnc: refreshSealed, scope: tok.scope || GBP_SCOPE, googleConnectedAt: new Date(), updatedAt: new Date() } },
          { upsert: true }
        )
        // Determine plan location cap.
        const { plan } = await getActivePlan(db, targetOrgId)
        let cap = plan?.limits?.locations
        if (cap === undefined) cap = 1
        if (cap === -1) cap = 1000
        // Fetch accounts + locations with multi-strategy fallbacks
        let stored = 0, warn = null, lastSyncError = null
        try {
          const { locations: locs, errors } = await fetchAllBusinessLocations(tok.access_token, cap)
          await db.collection('gbpLocations').deleteMany({ orgId: targetOrgId, isManual: { $ne: true } })
          if (locs.length) {
            await db.collection('gbpLocations').insertMany(locs.map((x) => ({ id: uuidv4(), orgId: targetOrgId, isManual: false, ...x, createdAt: new Date() })))
          }
          stored = locs.length
          if (stored === 0 && errors.length) {
            lastSyncError = errors.join('; ')
            warn = 'api_access'
          }
        } catch (apiErr) {
          lastSyncError = apiErr.message || String(apiErr)
          warn = apiErr.status === 403 ? 'api_access' : 'api_error'
        }
        await db.collection('gbpConnections').updateOne(
          { orgId: targetOrgId },
          { $set: { lastSyncError: lastSyncError || null, lastSyncAt: new Date() } }
        )
        await notify(db, targetOrgId, targetUserId, 'gbp_connected', 'Google Business Profile connected', stored ? `${stored} location(s) linked to your workspace.` : 'Your Google account is connected. Locations will sync once Business Profile API access is granted.')
        const r = redirect(`/account?gbp=connected&count=${stored}${warn ? `&warn=${warn}` : ''}`)
        r.headers.append('Set-Cookie', stateCookie('oauth_gbp_state', '', 0))
        if (!auth?.user && targetUserId && targetOrgId) {
          const sessionToken = signToken({ uid: targetUserId, orgId: targetOrgId })
          r.headers.append('Set-Cookie', serializeSession(sessionToken))
        }
        return r
      } catch (e) {
        return redirect('/account?gbp=failed')
      }
    }

    if (route === '/gbp/status' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const conn = await db.collection('gbpConnections').findOne({ orgId: auth.org.id })
      const locations = await db.collection('gbpLocations').find({ orgId: auth.org.id }).sort({ createdAt: 1 }).toArray()
      const { plan } = await getActivePlan(db, auth.org.id)
      return json({
        connected: !!conn,
        connectedAt: conn?.googleConnectedAt || null,
        lastSyncError: conn?.lastSyncError || null,
        scope: conn?.scope || null,
        hasBusinessScope: conn?.scope ? conn.scope.includes('business.manage') : true,
        locations: locations.map((l) => clean({ ...l, orgId: undefined })),
        locationLimit: plan?.limits?.locations ?? 1,
        googleEnabled: googleEnabled(),
        redirectUri: gbpRedirectUri(request),
        loginRedirectUri: loginRedirectUri(request),
      })
    }

    if (route === '/gbp/sync' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const conn = await db.collection('gbpConnections').findOne({ orgId: auth.org.id })
      if (!conn?.refreshTokenEnc) return json({ error: 'Google Business Profile is not connected' }, 400)

      let tok
      try {
        const refreshToken = unsealToken(conn.refreshTokenEnc)
        tok = await refreshAccessToken(refreshToken)
      } catch (tokErr) {
        return json({ error: 'Google token refresh failed. Please reconnect Google Business Profile in Account settings.', detail: tokErr.message }, 400)
      }

      const { plan } = await getActivePlan(db, auth.org.id)
      let cap = plan?.limits?.locations
      if (cap === undefined) cap = 1
      if (cap === -1) cap = 1000

      const { locations: locs, errors } = await fetchAllBusinessLocations(tok.access_token, cap)
      if (locs.length > 0) {
        await db.collection('gbpLocations').deleteMany({ orgId: auth.org.id, isManual: { $ne: true } })
        await db.collection('gbpLocations').insertMany(locs.map((x) => ({ id: uuidv4(), orgId: auth.org.id, isManual: false, ...x, createdAt: new Date() })))
        await db.collection('gbpConnections').updateOne(
          { orgId: auth.org.id },
          { $set: { lastSyncError: null, lastSyncAt: new Date() } }
        )
        await notify(db, auth.org.id, auth.user.id, 'gbp_connected', 'Google Business Profile synced', `${locs.length} location(s) linked to your workspace.`)
        return json({ ok: true, count: locs.length, locations: locs })
      } else {
        const errMsg = errors.length ? errors.join(' | ') : 'No locations found on this Google account.'
        await db.collection('gbpConnections').updateOne(
          { orgId: auth.org.id },
          { $set: { lastSyncError: errMsg, lastSyncAt: new Date() } }
        )
        return json({ ok: false, count: 0, error: errMsg, errors })
      }
    }

    if (route === '/gbp/location/manual' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const title = String(body.title || body.businessName || '').trim()
      if (!title) return json({ error: 'Business name is required' }, 400)

      const { plan } = await getActivePlan(db, auth.org.id)
      let cap = plan?.limits?.locations ?? 1
      if (cap !== -1) {
        const count = await db.collection('gbpLocations').countDocuments({ orgId: auth.org.id })
        if (count >= cap) return json({ error: `Location limit reached (${cap} max for your plan). Upgrade to add more.` }, 402)
      }

      const newLoc = {
        id: uuidv4(),
        orgId: auth.org.id,
        isManual: true,
        resourceName: `locations/manual-${uuidv4().slice(0, 8)}`,
        title,
        address: String(body.address || body.city || '').trim(),
        mapsUri: String(body.mapsUri || body.googleReviewUrl || '').trim(),
        placeId: String(body.placeId || '').trim(),
        primaryPhone: String(body.phone || '').trim(),
        websiteUri: String(body.website || '').trim(),
        createdAt: new Date(),
      }

      await db.collection('gbpLocations').insertOne(newLoc)
      return json({ ok: true, location: clean({ ...newLoc, orgId: undefined }) })
    }

    if (route.startsWith('/gbp/location/') && method === 'DELETE') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const locId = route.split('/')[3]
      await db.collection('gbpLocations').deleteOne({ id: locId, orgId: auth.org.id })
      return json({ ok: true })
    }

    if (route === '/gbp/disconnect' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      await db.collection('gbpConnections').deleteOne({ orgId: auth.org.id })
      await db.collection('gbpLocations').deleteMany({ orgId: auth.org.id })
      return json({ ok: true })
    }

    if (route === '/account/org' && method === 'PATCH') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const update = { updatedAt: new Date() }
      if (body.name && typeof body.name === 'string') update.name = body.name.trim()
      if (body.billingProfile && typeof body.billingProfile === 'object') {
        const bp = body.billingProfile
        update.billingProfile = {
          legalName: String(bp.legalName || '').trim(),
          gstin: String(bp.gstin || '').trim().toUpperCase(),
          address: String(bp.address || '').trim(),
          city: String(bp.city || '').trim(),
          state: String(bp.state || '').trim(),
          postalCode: String(bp.postalCode || '').trim(),
          phone: String(bp.phone || '').trim(),
          country: String(bp.country || 'IN').trim().toUpperCase(),
          currency: 'INR',
        }
      }
      await db.collection('organizations').updateOne({ id: auth.org.id }, { $set: update })
      const updated = await db.collection('organizations').findOne({ id: auth.org.id })
      return json({ org: clean(updated) })
    }

    // ==================== TEAM MANAGEMENT ====================
    if (route === '/team' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const memberships = await db.collection('memberships').find({ orgId: auth.org.id }).toArray()
      const userIds = memberships.map((m) => m.userId)
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray()
      const userMap = new Map(users.map((u) => [u.id, u]))
      const members = memberships.map((m) => {
        const u = userMap.get(m.userId) || {}
        return {
          id: m.id,
          userId: m.userId,
          role: m.role || 'member',
          email: u.email || '',
          name: u.name || '',
          avatar: u.avatar || '',
          lastLoginAt: u.lastLoginAt || null,
          createdAt: m.createdAt,
          isOwner: auth.org.ownerUserId === m.userId || m.role === 'owner',
        }
      })
      const pendingInvites = await db.collection('teamInvites').find({ orgId: auth.org.id }).sort({ createdAt: -1 }).toArray()
      const { plan } = await getActivePlan(db, auth.org.id)
      const seatLimit = plan?.limits?.team_seats ?? 1
      return json({
        members,
        pendingInvites: pendingInvites.map(clean),
        seatLimit,
        usedSeats: members.length,
        pendingSeats: pendingInvites.length,
        canInvite: seatLimit === -1 || (members.length + pendingInvites.length < seatLimit),
      })
    }

    if (route === '/team/invite' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      if (!['owner', 'admin', 'super_admin'].includes(auth.user?.role)) {
        return json({ error: 'Only workspace owners and admins can invite team members' }, 403)
      }
      const body = await request.json().catch(() => ({}))
      const email = String(body.email || '').trim().toLowerCase()
      const role = body.role === 'admin' ? 'admin' : 'member'
      if (!email || !/.+@.+\..+/.test(email)) return json({ error: 'A valid email address is required' }, 400)

      const existingUser = await db.collection('users').findOne({ email })
      if (existingUser) {
        const isMember = await db.collection('memberships').findOne({ orgId: auth.org.id, userId: existingUser.id })
        if (isMember) return json({ error: 'This user is already a member of this workspace' }, 400)
      }
      const existingInvite = await db.collection('teamInvites').findOne({ orgId: auth.org.id, email })
      if (existingInvite) return json({ error: 'An invitation is already pending for this email address' }, 400)

      const { plan } = await getActivePlan(db, auth.org.id)
      const seatLimit = plan?.limits?.team_seats ?? 1
      const currentUsed = await db.collection('memberships').countDocuments({ orgId: auth.org.id })
      const pendingCount = await db.collection('teamInvites').countDocuments({ orgId: auth.org.id })
      if (seatLimit !== -1 && currentUsed + pendingCount >= seatLimit) {
        return json(upgradePayload('team_seats', { used: currentUsed + pendingCount, limit: seatLimit }, plan), 402)
      }

      const token = crypto.randomBytes(24).toString('hex')
      const invite = {
        id: uuidv4(),
        orgId: auth.org.id,
        email,
        role,
        inviterId: auth.user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        createdAt: new Date(),
      }
      await db.collection('teamInvites').insertOne(invite)
      const origin = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
      const inviteLink = `${origin}/register?invite=${token}&email=${encodeURIComponent(email)}`
      sendTeamInviteEmail({
        email,
        inviterName: auth.user.name || 'Your team admin',
        orgName: auth.org.name,
        inviteLink,
        role,
      }).catch((e) => console.error('[MAIL:invite] error', e))
      await notify(db, auth.org.id, auth.user.id, 'team_invite', `Invited ${email}`, `Invitation sent for role ${role}.`)
      return json({ ok: true, invite: clean(invite) })
    }

    if (path[0] === 'team' && path[1] === 'invite' && path[2] && method === 'DELETE') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      if (!['owner', 'admin', 'super_admin'].includes(auth.user?.role)) {
        return json({ error: 'Only workspace owners and admins can cancel invitations' }, 403)
      }
      await db.collection('teamInvites').deleteOne({ id: path[2], orgId: auth.org.id })
      return json({ ok: true })
    }

    if (path[0] === 'team' && (path[1] === 'member' || (path[1] && path[1] !== 'invite')) && method === 'DELETE') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      if (!['owner', 'admin', 'super_admin'].includes(auth.user?.role)) {
        return json({ error: 'Only workspace owners and admins can remove team members' }, 403)
      }
      const targetId = path[1] === 'member' ? path[2] : path[1]
      const mem = await db.collection('memberships').findOne({
        orgId: auth.org.id,
        $or: [{ id: targetId }, { userId: targetId }],
      })
      if (!mem) return json({ error: 'Member not found' }, 404)
      if (mem.userId === auth.org.ownerUserId || mem.role === 'owner') {
        return json({ error: 'Cannot remove the workspace owner' }, 400)
      }
      await db.collection('memberships').deleteOne({ id: mem.id })
      await db.collection('users').updateOne({ id: mem.userId, orgId: auth.org.id }, { $set: { orgId: null } })
      await notify(db, auth.org.id, auth.user.id, 'member_removed', 'Team member removed', 'A user was removed from the workspace.')
      return json({ ok: true })
    }

    if (path[0] === 'team' && (path[1] === 'member' || (path[1] && path[1] !== 'invite')) && method === 'PATCH') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      if (!['owner', 'admin', 'super_admin'].includes(auth.user?.role)) {
        return json({ error: 'Only workspace owners and admins can modify roles' }, 403)
      }
      const targetId = path[1] === 'member' ? path[2] : path[1]
      const body = await request.json().catch(() => ({}))
      const newRole = body.role === 'admin' ? 'admin' : 'member'
      const mem = await db.collection('memberships').findOne({
        orgId: auth.org.id,
        $or: [{ id: targetId }, { userId: targetId }],
      })
      if (!mem) return json({ error: 'Member not found' }, 404)
      if (mem.userId === auth.org.ownerUserId || mem.role === 'owner') {
        return json({ error: 'Cannot modify the workspace owner role' }, 400)
      }
      await db.collection('memberships').updateOne({ id: mem.id }, { $set: { role: newRole } })
      await db.collection('users').updateOne({ id: mem.userId, orgId: auth.org.id }, { $set: { role: newRole } })
      return json({ ok: true, role: newRole })
    }

    // ==================== GOOGLE BUSINESS PROFILE: SYNC REVIEWS ====================
    if (route === '/gbp/sync-reviews' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const conn = await db.collection('gbpConnections').findOne({ orgId: auth.org.id })
      if (!conn || !conn.refreshTokenEnc) {
        return json({ error: 'Google Business Profile is not connected' }, 400)
      }
      let tok
      try {
        const refreshToken = unsealToken(conn.refreshTokenEnc)
        tok = await refreshAccessToken(refreshToken)
      } catch (tokErr) {
        return json({ error: 'Google token refresh failed. Please reconnect Google Business Profile in Account settings.', detail: tokErr.message }, 400)
      }
      const locations = await db.collection('gbpLocations').find({ orgId: auth.org.id }).toArray()
      if (!locations.length) {
        return json({ ok: true, imported: 0, updated: 0, message: 'No Google locations linked. Click Re-sync in Account to load locations.' })
      }
      const campaigns = await db.collection('campaigns').find({ orgId: auth.org.id }).toArray()
      let imported = 0, updated = 0, errors = []

      for (const loc of locations) {
        try {
          const googleReviews = await listGoogleReviews(tok.access_token, loc.accountName, loc.resourceName)
          const matchingCampaign = campaigns.find((c) => c.businessName?.toLowerCase() === loc.title?.toLowerCase()) || campaigns[0] || null

          for (const gr of googleReviews) {
            const rating = starRatingToNumber(gr.starRating)
            const text = gr.comment || ''
            const replyComment = gr.reviewReply?.comment || ''
            const existing = await db.collection('reviews').findOne({
              orgId: auth.org.id,
              $or: [
                gr.name ? { googleReviewName: gr.name } : null,
                gr.reviewId ? { googleReviewId: gr.reviewId } : null,
              ].filter(Boolean),
            })

            if (existing) {
              if (replyComment && !existing.reply) {
                await db.collection('reviews').updateOne(
                  { id: existing.id },
                  { $set: { reply: replyComment, replyStatus: 'published', publishedAt: new Date(gr.reviewReply?.updateTime || Date.now()), updatedAt: new Date() } }
                )
                updated++
              }
            } else {
              await db.collection('reviews').insertOne({
                id: uuidv4(),
                orgId: auth.org.id,
                campaignId: matchingCampaign?.id || null,
                businessName: matchingCampaign?.businessName || loc.title || 'My Business',
                reviewerName: gr.reviewer?.displayName || 'Google Reviewer',
                reviewerPhotoUrl: gr.reviewer?.profilePhotoUrl || '',
                rating,
                text,
                sentiment: deriveSentiment(rating),
                topics: detectTopics(text),
                replyStatus: replyComment ? 'published' : 'unanswered',
                reply: replyComment,
                replyTone: '',
                source: 'google',
                googleReviewName: gr.name || null,
                googleReviewId: gr.reviewId || null,
                googleLocationResource: loc.resourceName,
                createdAt: new Date(gr.createTime || Date.now()),
                updatedAt: new Date(),
              })
              imported++
            }
          }
        } catch (locErr) {
          console.warn(`[GBP:sync] Location ${loc.title} review fetch warning:`, locErr.message)
          errors.push({ location: loc.title, error: locErr.message })
        }
      }

      const msg = imported > 0 || updated > 0
        ? `Synced ${imported} new and ${updated} updated reviews from Google.`
        : errors.length > 0
          ? `Sync notice: ${errors[0].error}`
          : 'All reviews are up to date.'

      return json({ ok: true, imported, updated, errors, message: msg })
    }

    // ==================== SCHEDULED CRON: PROCESS AUTOMATED REVIEWS ====================
    if (route === '/cron/process-reviews' && (method === 'GET' || method === 'POST')) {
      const authHeader = request.headers.get('authorization') || ''
      const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
      const queryKey = request.nextUrl.searchParams.get('key') || request.nextUrl.searchParams.get('secret') || ''
      const provided = bearer || queryKey
      const cronSecret = process.env.CRON_SECRET
      if (cronSecret && provided !== cronSecret) {
        return json({ error: 'unauthorized', message: 'Invalid CRON_SECRET' }, 401)
      }

      const campaigns = await db.collection('campaigns').find({
        status: 'active',
        'automation.enabled': true,
      }).toArray()

      let published = 0, queued = 0, skipped = 0, processed = 0
      for (const campaign of campaigns) {
        if (!campaign.orgId) { skipped++; continue }
        if (!(await hasFeature(db, campaign.orgId, 'automated_replies'))) {
          skipped++
          continue
        }
        const lim = await checkLimit(db, campaign.orgId, 'monthly_ai_replies')
        if (!lim.allowed) {
          skipped++
          continue
        }

        const pending = await db.collection('reviews').find({
          campaignId: campaign.id,
          replyStatus: 'unanswered',
        }).limit(6).toArray()

        for (const rev of pending) {
          const check = await checkLimit(db, campaign.orgId, 'monthly_ai_replies')
          if (!check.allowed) break
          const res = await applyAutomation(db, campaign, rev)
          await consume(db, campaign.orgId, 'monthly_ai_replies', 1)
          processed++
          if (res.autoAction === 'auto_published') published++
          else queued++

          if (rev.rating <= 2 || rev.sentiment === 'negative') {
            const owner = await db.collection('users').findOne({ orgId: campaign.orgId, role: { $in: ['owner', 'admin'] } })
            if (owner?.email) {
              sendReviewAlertEmail({
                email: owner.email,
                businessName: campaign.businessName,
                reviewerName: rev.reviewerName,
                rating: rev.rating,
                text: rev.text,
              }).catch((e) => console.error('[MAIL:cron_alert] error', e))
            }
          }
        }
      }

      return json({
        ok: true,
        processed,
        published,
        queued,
        skipped,
        campaignsEvaluated: campaigns.length,
        timestamp: new Date().toISOString(),
      })
    }

    // ==================== PUBLIC PLANS (for landing/pricing) ====================
    if (route === '/plans' && method === 'GET') {
      const plans = await db.collection('plans').find({ isActive: true, isPublic: true }).sort({ sortOrder: 1 }).toArray()
      const seen = new Set()
      const unique = []
      for (const p of plans) {
        const key = p.slug || p.id
        if (!seen.has(key)) {
          seen.add(key)
          unique.push(clean(p))
        }
      }
      return json(unique)
    }

    // ==================== ACCOUNT: entitlements + notifications ====================
    if (route === '/me/entitlements' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      return json(await getEntitlements(db, auth.org.id))
    }

    if (route === '/notifications' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const list = await db.collection('notifications').find({ orgId: auth.org.id }).sort({ createdAt: -1 }).limit(50).toArray()
      const unread = list.filter((n) => !n.read).length
      return json({ notifications: list.map(clean), unread })
    }
    if (route === '/notifications/read' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      await db.collection('notifications').updateMany({ orgId: auth.org.id }, { $set: { read: true } })
      return json({ ok: true })
    }

    // ==================== BILLING (owner) ====================
    if (route === '/billing/coupon/validate' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const plan = await db.collection('plans').findOne({ id: body.planId })
      if (!plan) return json({ error: 'Plan not found' }, 404)
      const amount = planPrice(plan, body.interval || 'monthly', body.currency || 'INR')
      const settings = await getSettings(db)
      const v = await validateCoupon(db, { code: body.couponCode, orgId: auth.org.id, userId: auth.user.id, planId: plan.id, amount })
      if (!v.valid) return json({ valid: false, reason: v.reason }, 200)
      const totals = computeTotals(amount, v.discount, settings.taxPercent)
      return json({ valid: true, discount: v.discount, totals, coupon: { code: v.coupon.code, type: v.coupon.type, value: v.coupon.value } })
    }

    if (route === '/billing/checkout' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const plan = await db.collection('plans').findOne({ id: body.planId })
      if (!plan || !plan.isActive) return json({ error: 'Plan not found' }, 404)
      const interval = body.interval === 'yearly' ? 'yearly' : 'monthly'
      const currency = 'INR'
      const amount = planPrice(plan, interval, currency)
      const settings = await getSettings(db)
      let discount = 0, coupon = null
      if (body.couponCode) {
        const v = await validateCoupon(db, { code: body.couponCode, orgId: auth.org.id, userId: auth.user.id, planId: plan.id, amount })
        if (!v.valid) return json({ error: v.reason }, 400)
        discount = v.discount; coupon = v.coupon
      }
      const totals = computeTotals(amount, discount, settings.taxPercent)
      const useRazorpay = razorpayEnabled() && totals.total > 0
      const order = {
        id: uuidv4(), orgId: auth.org.id, userId: auth.user.id, planId: plan.id, interval, currency,
        totals, couponCode: coupon?.code || null, status: 'created',
        gateway: useRazorpay ? 'razorpay' : 'stub', razorpayOrderId: null, createdAt: new Date(),
      }

      if (useRazorpay) {
        try {
          const rzp = getRazorpay()
          const rzpOrder = await rzp.orders.create({
            amount: Math.round(totals.total * 100), // paise, GST-inclusive
            currency,
            receipt: order.id.replace(/-/g, '').slice(0, 40),
            notes: { orgId: auth.org.id, planId: plan.id, localOrderId: order.id },
          })
          order.razorpayOrderId = rzpOrder.id
          await db.collection('orders').insertOne(order)
          return json({
            orderId: order.id, razorpayOrderId: rzpOrder.id, amount: totals.total,
            amountPaise: rzpOrder.amount, currency, gateway: 'razorpay', stub: false,
            keyId: publicKeyId(), name: plan.name, totals,
          })
        } catch (e) {
          return json({ error: 'Could not create payment order. Please try again.' }, 502)
        }
      }

      await db.collection('orders').insertOne(order)
      // Stub mode (no keys) or zero-amount (Free / 100% coupon): client confirms directly.
      return json({
        orderId: order.id, amount: totals.total, currency, gateway: 'stub',
        stub: true, razorpayKeyId: publicKeyId(), totals,
      })
    }

    if (route === '/billing/confirm' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const order = await db.collection('orders').findOne({ id: body.orderId, orgId: auth.org.id })
      if (!order) return json({ error: 'Order not found' }, 404)
      if (order.status === 'paid') {
        const ent = await getEntitlements(db, auth.org.id)
        return json({ ok: true, alreadyPaid: true, entitlements: ent })
      }
      // REAL mode: verify the Razorpay Checkout signature before fulfilling.
      if (order.gateway === 'razorpay') {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = body
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
          return json({ error: 'Payment verification required' }, 400)
        }
        if (razorpay_order_id !== order.razorpayOrderId) {
          return json({ error: 'Order mismatch' }, 400)
        }
        let validSig = false
        try {
          validSig = verifyPaymentSignature({ orderId: order.razorpayOrderId, paymentId: razorpay_payment_id, signature: razorpay_signature }) === true
        } catch (e) { validSig = false }
        if (!validSig) return json({ error: 'Invalid payment signature' }, 400)
        const r = await fulfillOrder(db, order, { gateway: 'razorpay', gatewayRef: razorpay_payment_id })
        if (!r.ok) return json({ error: r.error || 'Fulfilment failed' }, 500)
        const ent = await getEntitlements(db, auth.org.id)
        return json({ ok: true, invoice: r.invoice, entitlements: ent })
      }
      // STUB / zero-amount: trust the client and fulfil immediately.
      const r = await fulfillOrder(db, order, { gateway: order.gateway })
      if (!r.ok) return json({ error: r.error || 'Fulfilment failed' }, 500)
      const ent = await getEntitlements(db, auth.org.id)
      return json({ ok: true, invoice: r.invoice, entitlements: ent })
    }

    if (route === '/billing/webhook' && method === 'POST') {
      // Must HMAC the exact raw bytes BEFORE parsing JSON.
      const rawBody = await request.text()
      const signature = request.headers.get('x-razorpay-signature')
      const eventId = request.headers.get('x-razorpay-event-id')
      if (!razorpayEnabled() || !process.env.RAZORPAY_WEBHOOK_SECRET) {
        // No webhook secret configured yet — acknowledge without processing.
        return json({ received: true, ignored: true })
      }
      if (!signature) return json({ error: 'Missing webhook signature' }, 400)
      let validWh = false
      try { validWh = verifyWebhook(rawBody, signature) === true } catch (e) { validWh = false }
      if (!validWh) return json({ error: 'Invalid webhook signature' }, 400)
      let event
      try { event = JSON.parse(rawBody) } catch (e) { return json({ error: 'Bad payload' }, 400) }
      // Idempotency: Razorpay may retry the same event.
      const evId = eventId || event.id || uuidv4()
      const dup = await db.collection('webhookEvents').findOne({ eventId: evId })
      if (dup) return json({ received: true, duplicate: true })
      await db.collection('webhookEvents').insertOne({ id: uuidv4(), eventId: evId, gateway: 'razorpay', event: event.event, payload: event, processedAt: new Date() })
      const payment = event.payload?.payment?.entity
      const rzpOrderId = payment?.order_id
      if (rzpOrderId && ['payment.captured', 'order.paid'].includes(event.event)) {
        const ord = await db.collection('orders').findOne({ razorpayOrderId: rzpOrderId })
        if (ord && ord.status !== 'paid') await fulfillOrder(db, ord, { gateway: 'razorpay', gatewayRef: payment.id })
      } else if (rzpOrderId && event.event === 'payment.failed') {
        await db.collection('orders').updateOne({ razorpayOrderId: rzpOrderId }, { $set: { status: 'failed', failedAt: new Date() } })
      }
      return json({ received: true })
    }

    if (route === '/billing/cancel' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const sub = await db.collection('subscriptions').findOne({ orgId: auth.org.id, status: { $in: ['active', 'trialing', 'past_due'] } })
      if (!sub) return json({ error: 'No active subscription' }, 404)
      await db.collection('subscriptions').updateOne({ id: sub.id }, { $set: { cancelAtPeriodEnd: true, updatedAt: new Date() } })
      await notify(db, auth.org.id, auth.user.id, 'subscription_cancelled', 'Subscription set to cancel', 'Your plan will remain active until the end of the current period.')
      return json({ ok: true })
    }

    if (route === '/billing/invoices' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const list = await db.collection('invoices').find({ orgId: auth.org.id }).sort({ createdAt: -1 }).limit(100).toArray()
      return json(list.map(clean))
    }

    if (path[0] === 'billing' && path[1] === 'invoices' && path[2] && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const idOrNumber = path[2]
      const invoice = await db.collection('invoices').findOne({
        $or: [{ id: idOrNumber }, { number: idOrNumber }],
        orgId: auth.org.id,
      })
      if (!invoice) return json({ error: 'Invoice not found' }, 404)
      const settings = await getSettings(db)
      const org = await db.collection('organizations').findOne({ id: auth.org.id })
      return json({
        invoice: clean(invoice),
        org: clean(org),
        seller: {
          companyName: 'niuronai Technologies HQ',
          address: 'Cyber City, Gurugram, Haryana 122002',
          gstin: '06AAACN1234F1Z5',
          hsnSac: '998313',
          taxLabel: settings.taxLabel || 'GST',
          taxPercent: settings.taxPercent || 18,
          supportEmail: 'support@niuron.ai',
        },
      })
    }

    // ==================== ADMIN ====================
    if (path[0] === 'admin') {
      if (!isAdmin(auth?.user)) return json({ error: 'forbidden' }, 403)

      if (route === '/admin/metrics' && method === 'GET') {
        const [users, orgs, allSubs, invoices, coupons, campaigns, gbp] = await Promise.all([
          db.collection('users').countDocuments(),
          db.collection('organizations').countDocuments(),
          db.collection('subscriptions').find({}).toArray(),
          db.collection('invoices').find({ status: 'paid' }).toArray(),
          db.collection('couponRedemptions').countDocuments(),
          db.collection('campaigns').countDocuments(),
          db.collection('gbpLocations').countDocuments().catch(() => 0),
        ])
        const plans = await db.collection('plans').find({}).toArray()
        const planById = Object.fromEntries(plans.map((p) => [p.id, p]))
        const paidSubs = allSubs.filter((s) => s.status === 'active' && planById[s.planId] && (planById[s.planId].prices?.INR?.monthly || 0) > 0)
        const mrr = paidSubs.reduce((sum, s) => {
          const p = planById[s.planId]
          const monthly = (p.prices?.INR?.monthly) || 0
          return sum + (s.interval === 'yearly' ? Math.round((p.prices?.INR?.yearly || monthly * 12) / 12) : monthly)
        }, 0)
        const revenue = invoices.reduce((sum, i) => sum + (i.total || 0), 0)
        const distribution = {}
        for (const s of allSubs) { const n = planById[s.planId]?.name || 'Unknown'; distribution[n] = (distribution[n] || 0) + 1 }
        const now = Date.now()
        const newUsers7d = await db.collection('users').countDocuments({ createdAt: { $gte: new Date(now - 7 * 24 * 3600 * 1000) } })
        return json({
          totalUsers: users, totalOrgs: orgs, paidUsers: paidSubs.length, newUsers7d,
          mrr, arr: mrr * 12, revenue, planDistribution: distribution, couponRedemptions: coupons,
          campaigns, gbpLocations: gbp, currency: 'INR',
        })
      }

      if (route === '/admin/users' && method === 'GET') {
        const users = await db.collection('users').find({}).sort({ createdAt: -1 }).limit(500).toArray()
        const out = []
        for (const u of users) {
          const sub = u.orgId ? await db.collection('subscriptions').findOne({ orgId: u.orgId }) : null
          const plan = sub ? await db.collection('plans').findOne({ id: sub.planId }) : null
          out.push({ ...clean({ ...u, passwordHash: undefined }), planName: plan?.name || 'Free', subStatus: sub?.status || 'none' })
        }
        return json(out)
      }
      if (path[1] === 'users' && path[2] && method === 'PATCH') {
        const body = await request.json().catch(() => ({}))
        const patch = { updatedAt: new Date() }
        if (body.status) patch.status = body.status
        if (body.role) patch.role = body.role
        await db.collection('users').updateOne({ id: path[2] }, { $set: patch })
        if (body.planId) {
          const u = await db.collection('users').findOne({ id: path[2] })
          if (u?.orgId) {
            const plan = await db.collection('plans').findOne({ id: body.planId })
            if (plan) {
              const now = new Date()
              await db.collection('subscriptions').updateOne(
                { orgId: u.orgId },
                { $set: { planId: plan.id, status: 'active', updatedAt: now, currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000), gateway: 'admin' }, $setOnInsert: { id: uuidv4(), orgId: u.orgId, createdAt: now } },
                { upsert: true }
              )
            }
          }
        }
        return json({ ok: true })
      }

      if (route === '/admin/plans' && method === 'GET') {
        const plans = await db.collection('plans').find({}).sort({ sortOrder: 1 }).toArray()
        return json(plans.map(clean))
      }
      if (route === '/admin/plans' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const now = new Date()
        const plan = { id: uuidv4(), name: body.name || 'New Plan', slug: (body.slug || body.name || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: body.description || '', prices: body.prices || { INR: { monthly: 0, yearly: 0 } }, trialDays: body.trialDays ?? 14, isActive: body.isActive !== false, isPublic: body.isPublic !== false, sortOrder: body.sortOrder ?? 99, limits: body.limits || {}, features: body.features || {}, createdAt: now, updatedAt: now }
        await db.collection('plans').insertOne(plan)
        return json(clean(plan))
      }
      if (path[1] === 'plans' && path[2] && path[3] === 'duplicate' && method === 'POST') {
        const src = await db.collection('plans').findOne({ id: path[2] })
        if (!src) return json({ error: 'Plan not found' }, 404)
        const copy = { ...src, _id: undefined, id: uuidv4(), name: `${src.name} (copy)`, slug: `${src.slug}-copy-${Math.random().toString(36).slice(2, 6)}`, isPublic: false, createdAt: new Date(), updatedAt: new Date() }
        delete copy._id
        await db.collection('plans').insertOne(copy)
        return json(clean(copy))
      }
      if (path[1] === 'plans' && path[2] && method === 'PUT') {
        const body = await request.json().catch(() => ({}))
        const patch = { ...body, updatedAt: new Date() }
        delete patch.id; delete patch._id
        await db.collection('plans').updateOne({ id: path[2] }, { $set: patch })
        return json(clean(await db.collection('plans').findOne({ id: path[2] })))
      }
      if (path[1] === 'plans' && path[2] && method === 'DELETE') {
        await db.collection('plans').updateOne({ id: path[2] }, { $set: { isActive: false, isPublic: false } })
        return json({ ok: true })
      }

      if (route === '/admin/coupons' && method === 'GET') {
        const list = await db.collection('coupons').find({}).sort({ createdAt: -1 }).toArray()
        return json(list.map(clean))
      }
      if (route === '/admin/coupons' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        if (!body.code) return json({ error: 'Coupon code is required' }, 400)
        const code = String(body.code).trim().toUpperCase()
        const dup = await db.collection('coupons').findOne({ code })
        if (dup) return json({ error: 'A coupon with this code already exists' }, 409)
        const coupon = { id: uuidv4(), code, type: body.type === 'fixed' ? 'fixed' : 'percent', value: Number(body.value) || 0, currency: 'INR', maxRedemptions: body.maxRedemptions ? Number(body.maxRedemptions) : null, perUserLimit: body.perUserLimit ? Number(body.perUserLimit) : null, minAmount: body.minAmount ? Number(body.minAmount) : 0, applicablePlanIds: Array.isArray(body.applicablePlanIds) ? body.applicablePlanIds : [], firstTimeOnly: !!body.firstTimeOnly, startsAt: body.startsAt || null, expiresAt: body.expiresAt || null, isActive: body.isActive !== false, redemptionCount: 0, createdAt: new Date(), updatedAt: new Date() }
        await db.collection('coupons').insertOne(coupon)
        return json(clean(coupon))
      }
      if (path[1] === 'coupons' && path[2] && method === 'PUT') {
        const body = await request.json().catch(() => ({}))
        const patch = { ...body, updatedAt: new Date() }
        delete patch.id; delete patch._id; delete patch.code; delete patch.redemptionCount
        await db.collection('coupons').updateOne({ id: path[2] }, { $set: patch })
        return json(clean(await db.collection('coupons').findOne({ id: path[2] })))
      }
      if (path[1] === 'coupons' && path[2] && method === 'DELETE') {
        await db.collection('coupons').deleteOne({ id: path[2] })
        return json({ ok: true })
      }

      if (route === '/admin/subscriptions' && method === 'GET') {
        const subs = await db.collection('subscriptions').find({}).sort({ createdAt: -1 }).limit(500).toArray()
        const out = []
        for (const s of subs) {
          const org = await db.collection('organizations').findOne({ id: s.orgId })
          const plan = await db.collection('plans').findOne({ id: s.planId })
          out.push({ ...clean(s), orgName: org?.name, planName: plan?.name })
        }
        return json(out)
      }

      if (route === '/admin/settings' && method === 'GET') {
        return json(await getSettings(db))
      }
      if (route === '/admin/settings' && method === 'PUT') {
        const body = await request.json().catch(() => ({}))
        const patch = { ...body, updatedAt: new Date() }
        delete patch.id; delete patch._id
        await db.collection('settings').updateOne({ id: 'global' }, { $set: patch }, { upsert: true })
        return json(await getSettings(db))
      }

      return json({ error: `Admin route ${route} not found` }, 404)
    }


    // ------------------ Campaigns (owner side) ------------------
    if (route === '/campaigns' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const list = await db.collection('campaigns').find({ orgId: auth.org.id }).sort({ createdAt: -1 }).limit(200).toArray()
      const withStats = []
      for (const c of list) {
        const a = await analyticsFor(db, c.id)
        withStats.push({ ...clean(c), stats: a })
      }
      return json(withStats)
    }

    if (route === '/campaigns' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const body = await request.json()
      if (!body.businessName) return json({ error: 'businessName is required' }, 400)
      const lim = await checkResourceLimit(db, auth.org.id, 'campaigns', 'campaigns')
      if (!lim.allowed) {
        const { plan } = await getActivePlan(db, auth.org.id)
        return json(upgradePayload('campaigns', lim, plan), 402)
      }
      const campaign = buildCampaign(body)
      campaign.orgId = auth.org.id
      await db.collection('campaigns').insertOne(campaign)
      return json(clean(campaign))
    }

    // /campaigns/:id  and /campaigns/:id/analytics
    if (path[0] === 'campaigns' && path[1]) {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const id = path[1]
      const campaign = await db.collection('campaigns').findOne({ id, orgId: auth.org.id })
      if (!campaign) return json({ error: 'Campaign not found' }, 404)

      if (path[2] === 'analytics' && method === 'GET') {
        return json(await analyticsFor(db, id))
      }

      if (path[2] === 'simulate-review' && method === 'POST') {
        const review = buildOneDemoReview(campaign)
        await db.collection('reviews').insertOne(review)
        let result = review
        let autoAction = 'none'
        if (campaign.automation?.enabled) {
          result = await applyAutomation(db, campaign, review)
          autoAction = result.autoAction
        }
        if (review.rating <= 2 || review.sentiment === 'negative') {
          const ownerUser = await db.collection('users').findOne({ orgId: auth.org.id })
          if (ownerUser?.email) {
            sendReviewAlertEmail({
              email: ownerUser.email,
              businessName: campaign.businessName,
              reviewerName: review.reviewerName,
              rating: review.rating,
              text: review.text,
            }).catch((e) => console.error('[MAIL:alert] error', e))
          }
        }
        return json({ review: clean(result), autoAction, automationEnabled: !!campaign.automation?.enabled })
      }

      if (!path[2] && method === 'GET') {
        return json(clean(campaign))
      }

      if (!path[2] && method === 'PUT') {
        const body = await request.json()
        const update = { ...body, updatedAt: new Date() }
        delete update.id
        delete update._id
        if (typeof update.services === 'string') {
          update.services = update.services.split(',').map((s) => s.trim()).filter(Boolean)
        }
        await db.collection('campaigns').updateOne({ id }, { $set: update })
        const updated = await db.collection('campaigns').findOne({ id })
        return json(clean(updated))
      }

      if (!path[2] && method === 'DELETE') {
        await db.collection('campaigns').deleteOne({ id })
        await db.collection('events').deleteMany({ campaignId: id })
        return json({ ok: true })
      }
    }

    // ------------------ Public review page ------------------
    // /public/:slug
    if (path[0] === 'public' && path[1]) {
      const slug = path[1]
      const campaign = await db.collection('campaigns').findOne({ slug })
      if (!campaign) return json({ error: 'Campaign not found' }, 404)

      if (!path[2] && method === 'GET') {
        // public-safe view
        const pub = clean(campaign)
        return json({
          slug: pub.slug,
          businessName: pub.businessName,
          city: pub.city,
          headline: pub.headline,
          subheadline: pub.subheadline,
          ctaText: pub.ctaText,
          primaryColor: pub.primaryColor,
          secondaryColor: pub.secondaryColor,
          logoUrl: pub.logoUrl,
          experienceButtons: (pub.experienceButtons || []).filter((b) => b.enabled),
          allowMultiSelect: pub.allowMultiSelect,
          textFieldEnabled: pub.textFieldEnabled,
          maxTextLength: pub.maxTextLength,
          googleReviewUrl: pub.googleReviewUrl,
          status: pub.status,
        })
      }

      if (path[2] === 'generate' && method === 'POST') {
        const body = await request.json()
        const experiences = body.experiences || []
        const text = body.text || ''
        if ((!experiences || experiences.length === 0) && !text) {
          return json({ error: 'Please select at least one experience or add a note.' }, 400)
        }
        // Charge AI draft usage to the campaign owner's org (customer-facing, no auth)
        if (campaign.orgId) {
          const lim = await checkLimit(db, campaign.orgId, 'monthly_ai_review_drafts')
          if (!lim.allowed) {
            return json({ error: 'This review page is temporarily unavailable. Please try again later.' }, 429)
          }
        }
        try {
          const drafts = await generateReviewDrafts(campaign, experiences, text)
          if (campaign.orgId) await consume(db, campaign.orgId, 'monthly_ai_review_drafts', 1)
          await trackEvent(db, campaign, 'draft_generated', {
            sessionId: body.sessionId,
            meta: { experiences, hasText: !!text },
          })
          return json({ drafts })
        } catch (e) {
          console.error('AI generation error:', e)
          return json({ error: 'AI generation failed. Please try again.', detail: String(e.message || e) }, 502)
        }
      }

      if (path[2] === 'event' && method === 'POST') {
        const body = await request.json()
        const allowed = [
          'landing_view',
          'experience_selected',
          'text_field_used',
          'draft_selected',
          'copy_clicked',
          'copy_success',
          'google_redirect_clicked',
        ]
        if (!allowed.includes(body.type)) return json({ error: 'invalid event type' }, 400)
        const ev = await trackEvent(db, campaign, body.type, body)
        return json({ ok: true, id: ev.id })
      }
    }

    // ------------------ Reviews inbox ------------------
    if (path[0] === 'reviews' && path[1] === 'seed' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const existing = await db.collection('reviews').countDocuments({ orgId: auth.org.id })
      if (existing > 0) return json({ ok: true, message: 'Reviews already present', created: 0 })
      const campaigns = await db.collection('campaigns').find({ orgId: auth.org.id }).toArray()
      let created = 0
      for (const c of campaigns) {
        const revs = buildDemoReviewsForCampaign(c)
        if (revs.length) { await db.collection('reviews').insertMany(revs); created += revs.length }
      }
      return json({ ok: true, created })
    }

    // Run automation across currently-unanswered reviews (capped to avoid timeouts)
    if (path[0] === 'reviews' && path[1] === 'automate' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      if (!(await hasFeature(db, auth.org.id, 'automated_replies'))) {
        const { plan } = await getActivePlan(db, auth.org.id)
        return json(featurePayload('automated_replies', plan), 402)
      }
      const body = await request.json().catch(() => ({}))
      const q = { replyStatus: 'unanswered', orgId: auth.org.id }
      if (body.campaignId) q.campaignId = body.campaignId
      const pending = await db.collection('reviews').find(q).limit(6).toArray()
      let published = 0, queued = 0, skipped = 0
      for (const rev of pending) {
        const campaign = await db.collection('campaigns').findOne({ id: rev.campaignId })
        if (!campaign || !campaign.automation?.enabled) { skipped++; continue }
        const lim = await checkLimit(db, auth.org.id, 'monthly_ai_replies')
        if (!lim.allowed) { skipped++; continue }
        const res = await applyAutomation(db, campaign, rev)
        await consume(db, auth.org.id, 'monthly_ai_replies', 1)
        if (res.autoAction === 'auto_published') published++
        else queued++
      }
      return json({ ok: true, processed: published + queued, published, queued, skipped, note: 'Processes up to 6 pending reviews per run.' })
    }

    if (route === '/reviews' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const sp = new URL(request.url).searchParams
      const q = { orgId: auth.org.id }
      if (sp.get('campaignId')) q.campaignId = sp.get('campaignId')
      const status = sp.get('status')
      if (status === 'unanswered') q.replyStatus = { $ne: 'published' }
      if (status === 'replied') q.replyStatus = 'published'
      if (status === 'awaiting') q.replyStatus = 'draft'
      if (sp.get('sentiment')) q.sentiment = sp.get('sentiment')
      if (sp.get('rating')) q.rating = parseInt(sp.get('rating'), 10)
      const search = sp.get('q')
      if (search) q.$or = [
        { text: { $regex: search, $options: 'i' } },
        { reviewerName: { $regex: search, $options: 'i' } },
      ]
      const list = await db.collection('reviews').find(q).sort({ createdAt: -1 }).limit(300).toArray()
      const statsFilter = { orgId: auth.org.id }
      if (sp.get('campaignId')) statsFilter.campaignId = sp.get('campaignId')
      const stats = await reviewStats(db, statsFilter)
      return json({ reviews: list.map(clean), stats })
    }

    if (path[0] === 'reviews' && path[1] && path[1] !== 'seed' && path[1] !== 'automate') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const id = path[1]
      const review = await db.collection('reviews').findOne({ id, orgId: auth.org.id })
      if (!review) return json({ error: 'Review not found' }, 404)
      const campaign = await db.collection('campaigns').findOne({ id: review.campaignId })

      if (path[2] === 'generate-reply' && method === 'POST') {
        const lim = await checkLimit(db, auth.org.id, 'monthly_ai_replies')
        if (!lim.allowed) {
          const { plan } = await getActivePlan(db, auth.org.id)
          return json(upgradePayload('monthly_ai_replies', lim, plan), 402)
        }
        const body = await request.json().catch(() => ({}))
        const tone = body.tone || 'Professional'
        const length = body.length || 'standard'
        try {
          const reply = await generateReviewReply(campaign || {}, review, tone, length)
          await consume(db, auth.org.id, 'monthly_ai_replies', 1)
          return json({ reply, tone, length })
        } catch (e) {
          console.error('reply gen error', e)
          return json({ error: 'AI reply generation failed. Please try again.', detail: String(e.message || e) }, 502)
        }
      }

      if (!path[2] && method === 'PUT') {
        const body = await request.json()
        const update = { updatedAt: new Date() }
        if (typeof body.reply === 'string') update.reply = body.reply
        if (body.replyTone) update.replyTone = body.replyTone
        if (body.replyStatus) update.replyStatus = body.replyStatus
        else if (typeof body.reply === 'string' && body.reply.trim() && review.replyStatus === 'unanswered') update.replyStatus = 'draft'
        await db.collection('reviews').updateOne({ id }, { $set: update })
        const updated = await db.collection('reviews').findOne({ id })
        return json(clean(updated))
      }

      if (path[2] === 'publish' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const reply = (body.reply ?? review.reply ?? '').trim()
        if (!reply) return json({ error: 'A reply is required before publishing' }, 400)

        let googleSynced = false
        let googleError = null
        if (review.source === 'google' && review.googleReviewName) {
          const conn = await db.collection('gbpConnections').findOne({ orgId: auth.org.id })
          if (conn?.refreshTokenEnc) {
            try {
              const refreshToken = unsealToken(conn.refreshTokenEnc)
              const tok = await refreshAccessToken(refreshToken)
              await publishGoogleReviewReply(tok.access_token, review.googleReviewName, reply)
              googleSynced = true
            } catch (gErr) {
              console.warn('[GBP:publishReply] Error posting to Google API:', gErr.message)
              googleError = gErr.message || 'Could not post to Google Business Profile'
            }
          }
        }

        const updateDoc = {
          reply,
          replyStatus: 'published',
          publishedAt: new Date(),
          updatedAt: new Date(),
          googleSynced,
        }
        if (googleError) updateDoc.googleError = googleError

        await db.collection('reviews').updateOne(
          { id },
          { $set: updateDoc }
        )
        const updated = await db.collection('reviews').findOne({ id })
        return json({ ...clean(updated), googleSynced, googleError })
      }
    }

    // ------------------ Local SEO Audit ------------------
    if (route === '/audits' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const lim = await checkLimit(db, auth.org.id, 'monthly_audits')
      if (!lim.allowed) {
        const { plan } = await getActivePlan(db, auth.org.id)
        return json(upgradePayload('monthly_audits', lim, plan), 402)
      }
      const body = await request.json().catch(() => ({}))
      let profile = body
      let campaignId = null
      if (body.campaignId) {
        const campaign = await db.collection('campaigns').findOne({ id: body.campaignId, orgId: auth.org.id })
        if (!campaign) return json({ error: 'Campaign not found' }, 404)
        campaignId = campaign.id
        profile = {
          businessName: campaign.businessName,
          category: campaign.category,
          city: campaign.city,
          services: campaign.services,
          description: campaign.description,
          googleReviewUrl: campaign.googleReviewUrl,
          website: campaign.website || body.website || '',
          phone: campaign.phone || body.phone || '',
          hasHours: campaign.hasHours ?? body.hasHours ?? false,
          photoCount: campaign.photoCount ?? body.photoCount ?? 0,
        }
      }
      if (!profile.businessName) return json({ error: 'businessName is required' }, 400)
      try {
        const audit = await runAudit(db, profile, campaignId, auth.org.id)
        await consume(db, auth.org.id, 'monthly_audits', 1)
        return json(clean(audit))
      } catch (e) {
        console.error('audit error', e)
        return json({ error: 'AI audit failed. Please try again.', detail: String(e.message || e) }, 502)
      }
    }

    if (route === '/audits' && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const sp = new URL(request.url).searchParams
      const q = { orgId: auth.org.id }
      if (sp.get('campaignId')) q.campaignId = sp.get('campaignId')
      const list = await db.collection('audits').find(q).sort({ createdAt: -1 }).limit(100).toArray()
      return json(list.map(clean))
    }

    if (path[0] === 'audits' && path[1] && method === 'GET') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const audit = await db.collection('audits').findOne({ id: path[1], orgId: auth.org.id })
      if (!audit) return json({ error: 'Audit not found' }, 404)
      return json(clean(audit))
    }

    if (path[0] === 'audits' && path[1] && method === 'DELETE') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      await db.collection('audits').deleteOne({ id: path[1], orgId: auth.org.id })
      return json({ ok: true })
    }

    if (path[0] === 'audits' && path[1] && path[2] === 'apply' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const audit = await db.collection('audits').findOne({ id: path[1], orgId: auth.org.id })
      if (!audit) return json({ error: 'Audit not found' }, 404)
      if (!audit.campaignId) return json({ error: 'This audit is not linked to a campaign' }, 400)
      const campaign = await db.collection('campaigns').findOne({ id: audit.campaignId, orgId: auth.org.id })
      if (!campaign) return json({ error: 'Campaign not found' }, 404)

      const patch = { updatedAt: new Date() }
      if (audit.optimizedDescription) patch.description = audit.optimizedDescription
      if (Array.isArray(audit.suggestedKeywords) && audit.suggestedKeywords.length) {
        const existingServices = campaign.services || []
        const combined = Array.from(new Set([...existingServices, ...audit.suggestedKeywords.slice(0, 6)]))
        patch.services = combined
      }
      await db.collection('campaigns').updateOne({ id: campaign.id }, { $set: patch })
      const updatedCampaign = await db.collection('campaigns').findOne({ id: campaign.id })
      await notify(db, auth.org.id, auth.user?.id, 'audit_applied', `Applied AI Audit to ${campaign.businessName}`, 'Campaign profile description and keywords updated.')
      return json({ ok: true, campaign: clean(updatedCampaign) })
    }

    // ------------------ Seed demo data ------------------
    if (route === '/seed' && method === 'POST') {
      if (!auth?.org) return json({ error: 'unauthorized' }, 401)
      const orgId = auth.org.id
      const existing = await db.collection('campaigns').countDocuments({ orgId })
      if (existing > 0) return json({ ok: true, message: 'Demo data already present', created: 0 })

      const demos = [
        {
          businessName: 'BK Spine Care Physiotherapy Clinic',
          category: 'Physiotherapy Clinic',
          city: 'Ranchi, Jharkhand',
          services: ['Physiotherapy', 'Back Pain Treatment', 'Sports Injury Rehab', 'Posture Correction'],
          description: 'A modern physiotherapy clinic focused on personalised recovery plans and hands-on care.',
          headline: 'How was your visit?',
          subheadline: 'Help others by sharing a quick review of your experience.',
          primaryColor: '#0f766e',
          secondaryColor: '#0891b2',
          googleReviewUrl: 'https://search.google.com/local/writereview?placeid=DEMO_PLACE_1',
        },
        {
          businessName: 'Aroma Bistro & Cafe',
          category: 'Cafe & Restaurant',
          city: 'Bengaluru, Karnataka',
          services: ['Specialty Coffee', 'Continental Breakfast', 'Wood-fired Pizza', 'Desserts'],
          description: 'A cosy neighbourhood cafe known for specialty coffee and a warm ambience.',
          headline: 'Enjoyed your meal?',
          subheadline: 'Tap what you loved and post a quick review.',
          primaryColor: '#b45309',
          secondaryColor: '#d97706',
          googleReviewUrl: 'https://search.google.com/local/writereview?placeid=DEMO_PLACE_2',
        },
        {
          businessName: 'BrightSmile Dental Studio',
          category: 'Dental Clinic',
          city: 'Pune, Maharashtra',
          services: ['Teeth Cleaning', 'Braces', 'Root Canal', 'Cosmetic Dentistry'],
          description: 'A gentle, modern dental studio with painless treatments and friendly staff.',
          headline: 'How was your appointment?',
          subheadline: 'Your feedback helps our clinic grow.',
          primaryColor: '#1d4ed8',
          secondaryColor: '#2563eb',
          googleReviewUrl: 'https://search.google.com/local/writereview?placeid=DEMO_PLACE_3',
        },
      ]

      const created = []
      for (const d of demos) {
        const c = buildCampaign(d)
        c.orgId = orgId
        await db.collection('campaigns').insertOne(c)
        created.push(c)
        // seed some funnel events
        const N = 40 + Math.floor(Math.random() * 60)
        const evs = []
        for (let i = 0; i < N; i++) {
          const sid = uuidv4()
          evs.push({ id: uuidv4(), campaignId: c.id, slug: c.slug, type: 'landing_view', sessionId: sid, meta: {}, createdAt: new Date() })
          if (Math.random() < 0.75) evs.push({ id: uuidv4(), campaignId: c.id, slug: c.slug, type: 'experience_selected', sessionId: sid, meta: {}, createdAt: new Date() })
          if (Math.random() < 0.6) evs.push({ id: uuidv4(), campaignId: c.id, slug: c.slug, type: 'draft_generated', sessionId: sid, meta: {}, createdAt: new Date() })
          if (Math.random() < 0.45) evs.push({ id: uuidv4(), campaignId: c.id, slug: c.slug, type: 'copy_success', sessionId: sid, meta: {}, createdAt: new Date() })
          if (Math.random() < 0.4) evs.push({ id: uuidv4(), campaignId: c.id, slug: c.slug, type: 'google_redirect_clicked', sessionId: sid, meta: {}, createdAt: new Date() })
        }
        if (evs.length) await db.collection('events').insertMany(evs)
      }

      // also seed demo reviews for these campaigns
      const revExisting = await db.collection('reviews').countDocuments({ orgId })
      if (revExisting === 0) {
        for (const c of created) {
          const revs = buildDemoReviewsForCampaign(c)
          if (revs.length) await db.collection('reviews').insertMany(revs)
        }
      }

      return json({ ok: true, created: created.length, campaigns: created.map((c) => ({ slug: c.slug, businessName: c.businessName })) })
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (error) {
    console.error('API Error:', error)
    return json({ error: 'Internal server error', detail: String(error.message || error) }, 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
