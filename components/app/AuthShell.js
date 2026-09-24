'use client'

import Link from 'next/link'
import { Sparkles, Star, ShieldCheck, TrendingUp } from 'lucide-react'

const HIGHLIGHTS = [
  { icon: Star, text: 'Turn happy customers into authentic Google reviews with AI' },
  { icon: TrendingUp, text: 'Climb the local 3-pack with an AI SEO audit & action plan' },
  { icon: ShieldCheck, text: 'Reply to every review on-brand — automatically & safely' },
]

// Shared brand panel + card wrapper for /login and /register.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-700 via-indigo-700 to-blue-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">niuron<span className="text-violet-200">ai</span></span>
        </Link>
        <div className="relative">
          <h2 className="max-w-md text-3xl font-bold leading-tight">Grow your Google reputation on autopilot.</h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((h, i) => {
              const Icon = h.icon
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-white/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-violet-50">{h.text}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <p className="relative text-xs text-violet-200">Trusted by local businesses across India · Payments secured by Razorpay</p>
      </div>

      {/* Form panel */}
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">niuron<span className="text-violet-600">ai</span></span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
