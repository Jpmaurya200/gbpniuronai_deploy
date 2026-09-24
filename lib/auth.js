import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { connectToMongo, clean } from './db'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
export const COOKIE_NAME = 'nai_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function hashPassword(pw) {
  return bcrypt.hash(String(pw), 10)
}
export async function verifyPassword(pw, hash) {
  if (!hash) return false
  return bcrypt.compare(String(pw), hash)
}
export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' })
}
export function verifyToken(token) {
  try { return jwt.verify(token, SECRET) } catch (e) { return null }
}

function getCookie(request, name) {
  const raw = request.headers.get('cookie') || ''
  const m = raw.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
  return m ? decodeURIComponent(m[1]) : null
}

export function readToken(request) {
  const c = getCookie(request, COOKIE_NAME)
  if (c) return c
  const auth = request.headers.get('authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

// Returns { user, org, membership } or null. Never throws.
export async function getAuthContext(request) {
  const token = readToken(request)
  if (!token) return null
  const decoded = verifyToken(token)
  if (!decoded?.uid) return null
  const db = await connectToMongo()
  const user = await db.collection('users').findOne({ id: decoded.uid })
  if (!user || user.status === 'suspended') return null
  const org = user.orgId ? await db.collection('organizations').findOne({ id: user.orgId }) : null
  return { user: clean(user), org: org ? clean(org) : null }
}

export function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'super_admin')
}

export function serializeSession(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE}`
}
export function serializeClear() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`
}
