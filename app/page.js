'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sparkles, Star, QrCode, MessageSquareQuote, Gauge, ShieldCheck, Zap, Check,
  ArrowRight, TrendingUp, Bot, MapPin, ChevronDown,
} from 'lucide-react'

const FEATURES = [
  { icon: QrCode, title: 'AI Review Campaigns', desc: 'QR-powered pages where happy customers tap what they loved and AI drafts an authentic Google review in seconds.' },
  { icon: Bot, title: 'AI Reply Inbox & Automation', desc: 'Draft on-brand owner replies to every review. Auto-publish 5-star reviews safely; route the rest to an approval queue.' },
  { icon: Gauge, title: 'Local SEO Audit Scorecard', desc: 'Instant AI health score across profile, reviews, keywords & engagement — with a prioritized plan to rank higher.' },
  { icon: TrendingUp, title: 'Analytics & Insights', desc: 'Track scans, drafts, conversions and reputation trends across every location from one dashboard.' },
]

const STEPS = [
  { n: 1, title: 'Connect your business', desc: 'Create a workspace and set up your locations in minutes.' },
  { n: 2, title: 'Launch review campaigns', desc: 'Print a branded QR poster and start collecting authentic reviews.' },
  { n: 3, title: 'Automate & optimize', desc: 'Let AI reply to reviews and follow your SEO plan to climb local rankings.' },
]

const TESTIMONIALS = [
  { name: 'Dr. Bharat K.', role: 'Physiotherapy Clinic, Ranchi', quote: 'We went from 40 to 210 Google reviews in three months. The QR flow makes it effortless for patients.' },
  { name: 'Aisha M.', role: 'Cafe & Bistro, Bengaluru', quote: 'The AI replies sound just like us. We reply to every review now without lifting a finger.' },
  { name: 'Rohit S.', role: 'Dental Studio, Pune', quote: 'The SEO audit showed exactly what to fix. We finally rank in the local 3-pack for our area.' },
]

const FAQS = [
  { q: 'Do I need a Google Business Profile?', a: 'Yes — niuronai helps you grow the reviews, reputation and local ranking of your existing Google Business Profile. You can connect it securely once you subscribe.' },
  { q: 'Are the AI reviews fake?', a: 'No. Customers tell us what they genuinely experienced; the AI only turns their real feedback into a natural, editable draft. Nothing is fabricated and it never violates Google guidelines.' },
  { q: 'Can I manage multiple locations?', a: 'Absolutely. Higher plans support multiple locations and team seats, all configurable to your subscription.' },
  { q: 'Which payment methods do you support?', a: 'We support Indian payments via Razorpay (UPI, cards, netbanking) and international cards. Prices are shown in INR.' },
  { q: 'Is there a free plan?', a: 'Yes, a permanent Free plan lets you explore the essentials, and paid plans include a 14-day trial.' },
]

const fmtINR = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')

export default function Landing() {
  const [plans, setPlans] = useState([])
  const [interval, setInterval] = useState('monthly')
  const [me, setMe] = useState(null)
  const [openFaq, setOpenFaq] = useState(0)

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          const seen = new Set()
          const unique = d.filter((p) => {
            const k = p.slug || p.id || p.name
            if (!k || seen.has(k)) return false
            seen.add(k)
            return true
          })
          setPlans(unique)
        }
      })
      .catch(() => {})
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user || null)).catch(() => {})
  }, [])

  const ctaHref = me ? '/dashboard' : '/register'

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/30"><Sparkles className="h-5 w-5" /></div>
            <span className="text-lg font-bold tracking-tight text-slate-900">niuron<span className="text-violet-600">ai</span></span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm font-medium text-slate-600 hover:text-slate-900">Features</a>
            <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900">Pricing</a>
            <a href="#faq" className="text-sm font-medium text-slate-600 hover:text-slate-900">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {me ? (
              <Link href="/dashboard"><Button className="bg-violet-600 hover:bg-violet-700">Go to dashboard</Button></Link>
            ) : (
              <>
                <Link href="/login"><Button variant="ghost">Log in</Button></Link>
                <Link href="/register"><Button className="bg-violet-600 hover:bg-violet-700">Start free</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-50 via-white to-white" />
        <div className="container relative py-20 text-center md:py-28">
          <Badge className="mb-5 border-0 bg-violet-100 text-violet-700 hover:bg-violet-100">AI for Google Business Profile &amp; Local SEO</Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 md:text-6xl">
            Win more Google reviews. <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Rank higher locally.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            niuronai turns happy customers into authentic 5-star reviews, replies to every review with AI, and gives you a clear local-SEO plan — so your business shows up first on Google.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={ctaHref}><Button size="lg" className="bg-violet-600 px-8 hover:bg-violet-700">Start free — no card needed <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
            <a href="#pricing"><Button size="lg" variant="outline" className="px-8">See pricing</Button></a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" /> 14-day trial on paid plans</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" /> Cancel anytime</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" /> Built for India &amp; global</span>
          </div>

          {/* product mock */}
          <div className="mx-auto mt-14 max-w-4xl rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-violet-200/40">
            <div className="rounded-xl bg-gradient-to-br from-slate-50 to-violet-50 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[{ icon: Star, label: 'Avg rating', val: '4.8' }, { icon: MessageSquareQuote, label: 'New reviews', val: '+210' }, { icon: Gauge, label: 'SEO score', val: '86' }].map((s) => (
                  <div key={s.label} className="rounded-xl bg-white p-4 text-left shadow-sm">
                    <s.icon className="h-5 w-5 text-violet-600" />
                    <p className="mt-3 text-2xl font-bold text-slate-900">{s.val}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-6">
        <div className="container flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-medium text-slate-400">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Google-guideline safe</span>
          <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /> Powered by Gemini AI</span>
          <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Multi-location ready</span>
          <span className="flex items-center gap-1.5"><Star className="h-4 w-4" /> Loved by local businesses</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Everything you need to dominate local search</h2>
          <p className="mt-3 text-slate-600">One platform for reviews, reputation and ranking — powered by AI.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {FEATURES.map((f) => (
            <Card key={f.title} className="border-slate-200 transition hover:shadow-lg">
              <CardContent className="flex gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><f.icon className="h-6 w-6" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{f.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Live in minutes</h2>
            <p className="mt-3 text-slate-600">No technical setup. No agency fees.</p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-lg font-bold text-white">{s.n}</div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing (dynamic) */}
      <section id="pricing" className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Simple, transparent pricing</h2>
          <p className="mt-3 text-slate-600">Start free. Upgrade as you grow. Prices in INR.</p>
          <div className="mt-6 inline-flex items-center gap-1 rounded-full bg-slate-100 p-1">
            <button onClick={() => setInterval('monthly')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${interval === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Monthly</button>
            <button onClick={() => setInterval('yearly')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${interval === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Yearly <span className="text-emerald-600">save 2 months</span></button>
          </div>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {plans.map((p) => {
            const price = p.prices?.INR?.[interval] || 0
            const popular = p.popular || p.slug === 'growth'
            return (
              <Card key={p.id} className={`relative flex flex-col border-slate-200 ${popular ? 'ring-2 ring-violet-500 shadow-xl' : ''}`}>
                {popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
                <CardContent className="flex flex-1 flex-col p-6">
                  <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
                  <p className="mt-1 min-h-[40px] text-sm text-slate-500">{p.description}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-extrabold text-slate-900">{price === 0 ? 'Free' : fmtINR(price)}</span>
                    {price > 0 && <span className="text-sm text-slate-500">/{interval === 'yearly' ? 'yr' : 'mo'}</span>}
                  </div>
                  <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                    <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {p.limits?.locations === -1 ? 'Unlimited' : p.limits?.locations} location{p.limits?.locations === 1 ? '' : 's'}</li>
                    <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {p.limits?.monthly_ai_replies === -1 ? 'Unlimited' : p.limits?.monthly_ai_replies} AI replies/mo</li>
                    <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {p.limits?.monthly_audits === -1 ? 'Unlimited' : p.limits?.monthly_audits} SEO audits/mo</li>
                    <li className="flex items-start gap-2">{p.features?.automated_replies ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <span className="mt-0.5 h-4 w-4 shrink-0 text-slate-300">—</span>} Automated replies</li>
                    <li className="flex items-start gap-2">{p.features?.rank_tracking ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <span className="mt-0.5 h-4 w-4 shrink-0 text-slate-300">—</span>} Rank tracking</li>
                  </ul>
                  <Link href={me ? '/billing' : '/register'} className="mt-6 mt-auto pt-6">
                    <Button className={`w-full ${popular ? 'bg-violet-600 hover:bg-violet-700' : ''}`} variant={popular ? 'default' : 'outline'}>
                      {price === 0 ? 'Start free' : 'Choose ' + p.name}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )
          })}
          {plans.length === 0 && <p className="col-span-4 text-center text-slate-400">Loading plans…</p>}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-slate-50 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Trusted by local businesses</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="border-slate-200">
                <CardContent className="p-6">
                  <div className="flex gap-0.5 text-amber-400">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
                  <p className="mt-3 text-sm text-slate-700">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-4"><p className="text-sm font-semibold text-slate-900">{t.name}</p><p className="text-xs text-slate-500">{t.role}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Frequently asked questions</h2>
          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200">
                <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} className="flex w-full items-center justify-between p-4 text-left">
                  <span className="font-medium text-slate-900">{f.q}</span>
                  <ChevronDown className={`h-5 w-5 text-slate-400 transition ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <p className="px-4 pb-4 text-sm text-slate-600">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-10 text-center text-white md:p-16">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold md:text-4xl">Ready to turn customers into 5-star reviews?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Join local businesses growing their Google presence with niuronai.</p>
          <Link href={ctaHref}><Button size="lg" className="mt-8 bg-white px-8 text-violet-700 hover:bg-white/90">Start free today <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-slate-500 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white"><Sparkles className="h-4 w-4" /></div>
            <span className="font-semibold text-slate-700">niuronai</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/legal/terms" className="hover:text-slate-900">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link href="/legal/refund" className="hover:text-slate-900">Refund policy</Link>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
          </div>
          <span>&copy; {new Date().getFullYear()} niuronai</span>
        </div>
      </footer>
    </div>
  )
}
