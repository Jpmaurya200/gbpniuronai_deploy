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
import { Loader2, Eye, EyeOff, Check } from 'lucide-react'

function GoogleButton({ enabled }) {
  const onClick = () => {
    if (enabled) window.location.href = '/api/auth/google'
    else toast.info('Google sign-up is being configured — sign up with email for now.')
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
      Sign up with Google
    </button>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const { user, loading, mutate } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [googleOn, setGoogleOn] = useState(false)
  const [inviteToken, setInviteToken] = useState('')

  useEffect(() => {
    fetch('/api/auth/config').then((r) => r.json()).then((d) => setGoogleOn(!!d.googleEnabled)).catch(() => {})
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const inv = sp.get('invite')
      const em = sp.get('email')
      if (inv) setInviteToken(inv)
      if (em) setEmail(decodeURIComponent(em))
    }
  }, [])

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [loading, user, router])

  const pwOk = password.length >= 6

  const submit = async (e) => {
    e.preventDefault()
    if (!email) { toast.error('Enter your email'); return }
    if (!pwOk) { toast.error('Password must be at least 6 characters'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sign up failed')
      await mutate({ user: data.user, org: data.org, entitlements: data.entitlements, role: data.role || data.user?.role }, { revalidate: false })
      toast.success(inviteToken ? 'Welcome to the team! Workspace loaded.' : 'Welcome to niuronai! Your workspace is ready.')
      router.replace('/dashboard')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={inviteToken ? 'Accept Team Invitation' : 'Create your account'}
      subtitle={inviteToken ? 'Complete your details to collaborate with your team on niuronai.' : 'Start free — no credit card required. Set up in under a minute.'}
      footer={<>Already have an account? <Link href="/login" className="font-semibold text-violet-600 hover:text-violet-700">Sign in</Link></>}
    >
      <GoogleButton enabled={googleOn} />
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" type="text" autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className={`flex items-center gap-1 text-xs ${pwOk ? 'text-emerald-600' : 'text-slate-400'}`}>
            <Check className="h-3.5 w-3.5" /> At least 6 characters
          </p>
        </div>
        <Button type="submit" disabled={busy} className="w-full bg-violet-600 hover:bg-violet-700">
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…</> : 'Create free account'}
        </Button>
        <p className="text-center text-xs leading-relaxed text-slate-400">
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>
    </AuthShell>
  )
}
