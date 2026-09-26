import crypto from 'node:crypto'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts'
const BIZINFO_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'

export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'
export const LOGIN_SCOPE = 'openid email profile'

export function googleEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function baseUrl(req = null) {
  // 1. If req is provided and it's a live host, use it directly (ensures redirects match incoming domain)
  if (req) {
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return `${proto}://${host}`
    }
  }
  // 2. If explicit production URL is configured, use it (Google Console requires exact match)
  if (process.env.NEXT_PUBLIC_BASE_URL && !process.env.NEXT_PUBLIC_BASE_URL.includes('localhost') && !process.env.NEXT_PUBLIC_BASE_URL.includes('127.0.0.1')) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  // 3. Production URL from Vercel
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, '')}`
  }
  // 4. Vercel deployment URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
  }
  // 5. Fallback NEXT_PUBLIC_BASE_URL or localhost
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  return 'http://localhost:3000'
}

export const loginRedirectUri = (req = null) => `${baseUrl(req)}/api/auth/google/callback`
export const gbpRedirectUri = (req = null) => `${baseUrl(req)}/api/gbp/callback`

export function randomState() {
  return crypto.randomBytes(24).toString('base64url')
}

export function signOAuthState(payload) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
  const data = JSON.stringify({ ...payload, exp: Date.now() + 15 * 60 * 1000 })
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${Buffer.from(data).toString('base64url')}.${sig}`
}

export function verifyOAuthState(stateStr) {
  if (!stateStr || typeof stateStr !== 'string') return null
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
  const parts = stateStr.split('.')
  if (parts.length !== 2) return null
  const [dataB64, sig] = parts
  try {
    const rawData = Buffer.from(dataB64, 'base64url').toString()
    const expectedSig = crypto.createHmac('sha256', secret).update(rawData).digest('base64url')
    if (sig !== expectedSig) return null
    const payload = JSON.parse(rawData)
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch (e) {
    return null
  }
}

export function buildAuthUrl({ scope, redirectUri, state, offline = false }) {
  const u = new URL(AUTH_URL)
  const params = {
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    include_granted_scopes: 'true',
  }
  if (offline) { params.access_type = 'offline'; params.prompt = 'consent' }
  u.search = new URLSearchParams(params).toString()
  return u.toString()
}

async function postToken(body) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const x = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(x.error_description || x.error || 'Google token error')
  return x
}

export function exchangeCode(code, redirectUri) {
  return postToken({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
}

export function refreshAccessToken(refreshToken) {
  return postToken({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
}

async function getJSON(url, accessToken) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const x = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(x.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e }
  return x
}

export function getUserInfo(accessToken) {
  return getJSON(USERINFO_URL, accessToken)
}

export async function listAccounts(accessToken) {
  let pageToken, all = []
  do {
    const u = new URL(ACCOUNTS_URL)
    u.searchParams.set('pageSize', '20')
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const x = await getJSON(u.toString(), accessToken)
    all.push(...(x.accounts || []))
    pageToken = x.nextPageToken
  } while (pageToken)
  return all
}

export async function listLocations(accessToken, accountName, limit = 25) {
  let pageToken, all = []
  do {
    const u = new URL(`${BIZINFO_BASE}/${accountName}/locations`)
    u.searchParams.set('pageSize', '100')
    u.searchParams.set('readMask', 'name,title,storeCode,websiteUri,storefrontAddress,phoneNumbers,metadata')
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const x = await getJSON(u.toString(), accessToken)
    all.push(...(x.locations || []))
    pageToken = x.nextPageToken
    if (all.length >= limit) break
  } while (pageToken)
  return all.slice(0, limit)
}

export async function fetchAllBusinessLocations(accessToken, limit = 25) {
  let errors = []
  let allLocations = []

  // Strategy 1: List accounts, then list locations for each account
  try {
    const accounts = await listAccounts(accessToken)
    if (accounts && accounts.length > 0) {
      for (const acc of accounts) {
        if (allLocations.length >= limit) break
        try {
          const locs = await listLocations(accessToken, acc.name, limit - allLocations.length)
          allLocations.push(...locs.map((x) => ({ ...normalizeLocation(x), accountName: acc.name })))
        } catch (locErr) {
          errors.push(`Account ${acc.name} error: ${locErr.message}`)
        }
      }
    } else {
      errors.push('No accounts returned from listAccounts')
    }
  } catch (accErr) {
    errors.push(`listAccounts error: ${accErr.message}`)
  }

  // Strategy 2: If no locations found, try wildcard accounts/-/locations (supported in Google Business Information API v1)
  if (allLocations.length === 0) {
    try {
      const u = new URL(`${BIZINFO_BASE}/accounts/-/locations`)
      u.searchParams.set('pageSize', '100')
      u.searchParams.set('readMask', 'name,title,storeCode,websiteUri,storefrontAddress,phoneNumbers,metadata')
      const x = await getJSON(u.toString(), accessToken)
      const locs = x.locations || []
      allLocations.push(...locs.slice(0, limit).map((l) => ({ ...normalizeLocation(l), accountName: 'accounts/-' })))
    } catch (wildErr) {
      errors.push(`Wildcard accounts/-/locations error: ${wildErr.message}`)
      // Strategy 3: Try minimal readMask in case metadata fields caused permission/validation errors
      try {
        const u2 = new URL(`${BIZINFO_BASE}/accounts/-/locations`)
        u2.searchParams.set('pageSize', '100')
        u2.searchParams.set('readMask', 'name,title,storefrontAddress,phoneNumbers')
        const x2 = await getJSON(u2.toString(), accessToken)
        const locs2 = x2.locations || []
        allLocations.push(...locs2.slice(0, limit).map((l) => ({ ...normalizeLocation(l), accountName: 'accounts/-' })))
      } catch (minErr) {
        errors.push(`Minimal readMask error: ${minErr.message}`)
      }
    }
  }

  return { locations: allLocations, errors }
}

// ---- Refresh-token encryption at rest (AES-256-GCM) ----
function encKey() {
  const b64 = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY_BASE64
  if (!b64) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_BASE64 not set')
  return Buffer.from(b64, 'base64')
}
export function sealToken(str) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const data = Buffer.concat([c.update(String(str), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), data].map((x) => x.toString('base64url')).join('.')
}
export function unsealToken(sealed) {
  const [iv, tag, data] = String(sealed).split('.').map((x) => Buffer.from(x, 'base64url'))
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(data), d.final()]).toString('utf8')
}

// Flatten a GBP location resource into a compact, storable shape.
export function normalizeLocation(loc) {
  const addr = loc.storefrontAddress || {}
  const addressLines = [...(addr.addressLines || []), [addr.locality, addr.administrativeArea, addr.postalCode].filter(Boolean).join(', ')].filter(Boolean)
  return {
    resourceName: loc.name,
    title: loc.title || '',
    storeCode: loc.storeCode || '',
    websiteUri: loc.websiteUri || '',
    primaryPhone: loc.phoneNumbers?.primaryPhone || '',
    address: addressLines.join(', '),
    placeId: loc.metadata?.placeId || '',
    mapsUri: loc.metadata?.mapsUri || '',
  }
}

async function putJSON(url, accessToken, body) {
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const x = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(x.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e }
  return x
}

export function starRatingToNumber(ratingStr) {
  switch (String(ratingStr).toUpperCase()) {
    case 'FIVE': return 5
    case 'FOUR': return 4
    case 'THREE': return 3
    case 'TWO': return 2
    case 'ONE': return 1
    default: return typeof ratingStr === 'number' ? ratingStr : 5
  }
}

export async function listGoogleReviews(accessToken, accountName, locationResourceName, pageSize = 50) {
  let targetPath = locationResourceName
  if (!targetPath.startsWith('accounts/') && accountName) {
    targetPath = `${accountName.replace(/\/$/, '')}/${locationResourceName.replace(/^\//, '')}`
  }
  const url = `https://mybusiness.googleapis.com/v4/${targetPath}/reviews?pageSize=${pageSize}`
  const data = await getJSON(url, accessToken)
  return data.reviews || []
}

export async function publishGoogleReviewReply(accessToken, reviewResourceName, comment) {
  const cleanName = reviewResourceName.replace(/^\//, '')
  const url = `https://mybusiness.googleapis.com/v4/${cleanName}/reply`
  return putJSON(url, accessToken, { comment })
}

