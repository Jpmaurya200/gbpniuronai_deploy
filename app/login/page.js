'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import AuthShell from '@/components/app/AuthShell'
import { useSession } from '@/lib/useSession'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff } from 'lucide-react'

function GoogleButton({ enabled }) {
  const onClick = () => {
    if (enabled) window.location.href = '/api/auth/google'
    else toast.info('Google sign-in is being configured — use email & password for now.')
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
      Continue with Google
    </button>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, mutate } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [next, setNext] = useState('/dashboard')
  const [googleOn, setGoogleOn] = useState(false)

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const p = sp.get('next'); if (p) setNext(p)
    const err = sp.get('error')
    if (err) {
      const map = { state: 'Login session expired, please try again.', email_unverified: 'Your Google email is not verified.', google_denied: 'Google sign-in was cancelled.', google_failed: 'Google sign-in failed, please try again.' }
      toast.error(map[err] || 'Sign-in failed')
    }
    fetch('/api/auth/config').then((r) => r.json()).then((d) => setGoogleOn(!!d.googleEnabled)).catch(() => {})
  }, [])

  // Already authenticated -> bounce to app.
  useEffect(() => {
    if (!loading && user) router.replace(next || '/dashboard')
  }, [loading, user, next, router])

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Enter your email and password'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Login failed')
        throw new Error(msg)
      }
      // Prime the session cache so guarded pages see the user immediately.
      await mutate({ user: data.user, org: data.org, entitlements: data.entitlements, role: data.role || data.user?.role }, { revalidate: false })
      toast.success('Welcome back!')
      router.replace(next || '/dashboard')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in to niuronai"
      subtitle="Welcome back. Manage your reviews, reputation and rankings."
      footer={<>New to niuronai? <Link href="/register" className="font-semibold text-violet-600 hover:text-violet-700">Create an account</Link></>}
    >
      <GoogleButton enabled={googleOn} />
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" disabled={busy} className="w-full bg-violet-600 hover:bg-violet-700">
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
