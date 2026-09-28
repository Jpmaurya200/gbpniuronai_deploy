'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sparkles, Star, QrCode, MessageSquareQuote, Gauge, ShieldCheck, Zap, Check,
  ArrowRight, TrendingUp, Bot, MapPin, ChevronDown, Clock, Gift, Users, BarChart3,
  Shield, Percent, Timer, Crown, Heart, X, Flame, Award, IndianRupee, Plus,
} from 'lucide-react'

const FEATURES = [
  { icon: QrCode, title: 'AI Review Campaigns', desc: 'QR-powered pages where happy customers tap what they loved — AI drafts an authentic Google review in seconds.', color: 'violet' },
  { icon: Bot, title: 'Smart AI Reply Inbox', desc: 'Draft on-brand owner replies to every review. Auto-publish 5-star reviews safely; route the rest to an approval queue.', color: 'blue' },
  { icon: Gauge, title: 'Local SEO Audit Scorecard', desc: 'Instant AI health score across profile, reviews, keywords & engagement — with a prioritized plan to rank higher.', color: 'emerald' },
  { icon: TrendingUp, title: 'Analytics & Insights', desc: 'Track scans, drafts, conversions and reputation trends across every location from one dashboard.', color: 'amber' },
  { icon: Shield, title: 'Google-Guideline Safe', desc: 'Every AI review is generated from real customer feedback. 100% compliant with Google\'s review policies.', color: 'rose' },
  { icon: Users, title: 'Multi-Location Ready', desc: 'Manage unlimited locations and team members. Perfect for agencies and chains. Add locations for just ₹150 each.', color: 'cyan' },
]

const STEPS = [
  { n: 1, title: 'Sign up & connect', desc: 'Create your account and link your Google Business Profile in under 2 minutes.', icon: Zap },
  { n: 2, title: 'Launch review campaigns', desc: 'Print a branded QR poster and start collecting authentic 5-star reviews instantly.', icon: QrCode },
  { n: 3, title: 'Watch your reputation grow', desc: 'AI replies to reviews, climbs your local ranking, and drives more footfall — on autopilot.', icon: TrendingUp },
]

const RESULTS = [
  { val: '4.8★', label: 'Average rating boost', desc: 'Most businesses reach 4.5+ within 60 days' },
  { val: '3x', label: 'More Google reviews', desc: 'Compared to asking customers manually' },
  { val: '< 2 min', label: 'To go live', desc: 'No tech skills needed, works from day one' },
  { val: '100%', label: 'AI-powered replies', desc: 'Never miss responding to a review again' },
]

const TESTIMONIALS = [
  { name: 'Dr. Bharat K.', role: 'Physiotherapy Clinic, Ranchi', quote: 'We went from 40 to 210 Google reviews in three months. The QR flow makes it effortless for patients.', rating: 5 },
  { name: 'Aisha M.', role: 'Cafe & Bistro, Bengaluru', quote: 'The AI replies sound just like us. We reply to every review now without lifting a finger. Absolute game-changer!', rating: 5 },
  { name: 'Rohit S.', role: 'Dental Studio, Pune', quote: 'The SEO audit showed exactly what to fix. We finally rank in the local 3-pack for our area.', rating: 5 },
  { name: 'Priya T.', role: 'Salon Chain, Mumbai', quote: 'Managing reviews for 5 locations used to take hours. Now niuronai handles it all. Worth every rupee!', rating: 5 },
]

const FAQS = [
  { q: 'Do I need a Google Business Profile?', a: 'Yes — niuronai helps you grow the reviews, reputation and local ranking of your existing Google Business Profile. You can connect it securely once you subscribe.' },
  { q: 'Are the AI-generated reviews fake?', a: 'Absolutely not. Customers share their genuine experience through our smart form; the AI simply turns their real feedback into a well-written, natural review draft. Nothing is fabricated.' },
  { q: 'What happens after the 14-day trial?', a: 'After your ₹199 trial ends, you can choose any plan — 1 month, 3 months, 6 months, or 12 months. If you don\'t subscribe, your account remains but features are paused until you reactivate.' },
  { q: 'Can I add more locations later?', a: 'Yes! You can add extra locations anytime for just ₹150 per location. Each location also gets its own review campaign automatically.' },
  { q: 'Which payment methods do you support?', a: 'We support all Indian payments via Razorpay — UPI, debit/credit cards, netbanking, and wallets. All prices are in INR and include GST.' },
  { q: 'Can I cancel anytime?', a: 'Yes. There are no lock-in contracts. Cancel anytime and you keep access until your current period ends.' },
  { q: 'Is my data safe?', a: 'Your data is encrypted and stored securely. We follow Google\'s Limited Use policy and never share your business data with anyone.' },
]

const fmtINR = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')

const PLANS = [
  { slug: 'trial', name: '14-Day Trial', price: 199, original: null, interval: 'trial', badge: 'First Time', desc: 'Try everything free for 14 days', perMonth: null, savings: null, firstTimeOnly: true },
  { slug: '1month', name: '1 Month', price: 449, original: 1349, interval: '1month', badge: null, desc: 'Full access, cancel anytime', perMonth: 449, savings: 67 },
  { slug: '3month', name: '3 Months', price: 999, original: 4047, interval: '3month', badge: 'BEST VALUE', desc: 'Most popular — save 75%', perMonth: 333, savings: 75, popular: true },
  { slug: '6month', name: '6 Months', price: 1799, original: 8094, interval: '6month', badge: null, desc: 'Half-yearly savings', perMonth: 300, savings: 78 },
  { slug: '12month', name: '12 Months', price: 2999, original: 16188, interval: '12month', badge: null, desc: 'Maximum annual savings', perMonth: 250, savings: 81 },
]

export default function Landing() {
  const [me, setMe] = useState(null)
  const [openFaq, setOpenFaq] = useState(0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user || null)).catch(() => {})
  }, [])

  const ctaHref = me ? '/dashboard' : '/register'

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">niuron<span className="text-violet-600">ai</span></span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors">Features</a>
            <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors">Pricing</a>
            <a href="#reviews" className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors">Reviews</a>
            <a href="#faq" className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {me ? (
              <Link href="/dashboard"><Button className="bg-violet-600 hover:bg-violet-700">Go to dashboard</Button></Link>
            ) : (
              <>
                <Link href="/login"><Button variant="ghost">Log in</Button></Link>
                <Link href="/register"><Button className="bg-violet-600 hover:bg-violet-700">Start for ₹199 <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-50/80 via-white to-white" />
        <div className="pointer-events-none absolute -top-40 -right-40 h-80 w-80 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="container relative py-16 text-center md:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-700 mb-6">
            <Flame className="h-4 w-4 text-orange-500" /> Limited Offer — Start at just ₹199
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 md:text-6xl lg:text-7xl">
            Get more <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">Google Reviews</span> with AI
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 md:text-xl">
            niuronai generates authentic 5-star reviews from happy customers, replies to every review with AI, and boosts your local Google ranking — all on autopilot.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={ctaHref}>
              <Button size="lg" className="bg-violet-600 px-8 text-base hover:bg-violet-700 shadow-lg shadow-violet-600/25">
                Start 14-Day Trial — ₹199 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#pricing">
              <Button size="lg" variant="outline" className="px-8 text-base">See all plans</Button>
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" /> All features included</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" /> Cancel anytime</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" /> Works for any local business</span>
          </div>

          {/* Stats preview */}
          <div className="mx-auto mt-14 max-w-4xl">
            <div className="grid gap-4 sm:grid-cols-4">
              {RESULTS.map((r) => (
                <div key={r.label} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm hover:shadow-md transition-shadow">
                  <p className="text-3xl font-extrabold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{r.val}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{r.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-5">
        <div className="container flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-medium text-slate-400">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Google-guideline safe</span>
          <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /> Powered by Gemini AI</span>
          <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Multi-location ready</span>
          <span className="flex items-center gap-1.5"><Star className="h-4 w-4" /> Trusted by 500+ businesses</span>
          <span className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> Secure & encrypted</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Badge className="mb-4 border-0 bg-violet-100 text-violet-700 hover:bg-violet-100">Powerful Features</Badge>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Everything you need to <span className="text-violet-600">dominate local search</span></h2>
          <p className="mt-3 text-slate-600">One platform for reviews, reputation and ranking — powered by AI.</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="group border-slate-200 transition-all hover:shadow-xl hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Simple Setup</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Live in under <span className="text-emerald-600">2 minutes</span></h2>
            <p className="mt-3 text-slate-600">No technical setup. No agency fees. Just results.</p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative text-center">
                {s.n < 3 && <div className="absolute top-6 left-[60%] hidden h-0.5 w-[80%] bg-gradient-to-r from-violet-300 to-transparent md:block" />}
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/30">
                  <s.icon className="h-6 w-6" />
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-violet-600 shadow">{s.n}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600 max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative py-20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-50/50 to-white" />
        <div className="container relative">
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-0 bg-orange-100 text-orange-700 hover:bg-orange-100">Limited Launch Pricing</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">One plan. <span className="text-violet-600">All features.</span> Pick your duration.</h2>
            <p className="mt-3 text-slate-600">Every plan includes unlimited AI reviews, replies, audits, rank tracking & more. No feature gates.</p>
          </div>

          {/* Plan cards */}
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {/* Trial card - spanning top on mobile */}
            <div className="md:col-span-2 lg:col-span-4">
              <div className="mx-auto max-w-lg rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-5">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                  <div className="text-center sm:text-left">
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <Gift className="h-5 w-5 text-violet-600" />
                      <span className="font-bold text-slate-900">14-Day Trial</span>
                      <Badge className="bg-violet-600 text-white text-[10px]">FIRST TIME</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">Full access to all features. Experience niuronai risk-free.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-extrabold text-slate-900">₹199</span>
                    <Link href={ctaHref}>
                      <Button className="bg-violet-600 hover:bg-violet-700 whitespace-nowrap">
                        Start trial <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Duration plans */}
            {PLANS.filter(p => !p.firstTimeOnly).map((p) => (
              <Card key={p.slug} className={`relative flex flex-col overflow-hidden transition-all hover:shadow-xl ${
                p.popular ? 'border-violet-500 ring-2 ring-violet-500 shadow-xl scale-[1.02]' : 'border-slate-200'
              }`}>
                {p.popular && (
                  <div className="bg-gradient-to-r from-violet-600 to-indigo-600 py-1.5 text-center text-xs font-bold text-white tracking-wider">
                    ⚡ MOST POPULAR — BEST VALUE
                  </div>
                )}
                <CardContent className={`flex flex-1 flex-col ${p.popular ? 'p-6' : 'p-6 pt-8'}`}>
                  <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{p.desc}</p>
                  <div className="mt-4">
                    {p.original && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-slate-400 line-through">{fmtINR(p.original)}</span>
                        <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-0">{p.savings}% OFF</Badge>
                      </div>
                    )}
                    <span className="text-4xl font-extrabold text-slate-900">{fmtINR(p.price)}</span>
                  </div>
                  {p.perMonth && (
                    <p className="mt-1 text-sm text-violet-600 font-medium">≈ {fmtINR(p.perMonth)}/month</p>
                  )}
                  <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Unlimited AI review drafts</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Unlimited AI replies</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Unlimited SEO audits</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Rank tracking & analytics</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> White-label & API access</li>
                    <li className="flex items-center gap-2"><Plus className="h-4 w-4 text-violet-500 shrink-0" /> Extra locations at ₹150 each</li>
                  </ul>
                  <Link href={me ? '/billing' : '/register'} className="mt-auto pt-6">
                    <Button className={`w-full text-base py-5 ${p.popular ? 'bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/25' : ''}`} variant={p.popular ? 'default' : 'outline'}>
                      {p.popular ? 'Get Best Value' : `Choose ${p.name}`}
                      {p.popular && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Addon note */}
          <div className="mt-8 mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-5 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-700">
              <MapPin className="h-4 w-4 text-violet-600" />
              <span>Need more locations? Add locations anytime for <strong className="text-violet-600">₹150/location</strong> — each includes a campaign automatically.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof / testimonials */}
      <section id="reviews" className="bg-slate-50 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">Real Results</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Loved by <span className="text-violet-600">local businesses</span> across India</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="border-slate-200 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex gap-0.5 text-amber-400">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
                  <p className="mt-3 text-sm text-slate-700 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-600">{t.name[0]}</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <Badge className="mb-4 border-0 bg-blue-100 text-blue-700 hover:bg-blue-100">Got Questions?</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Frequently asked questions</h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-all hover:border-violet-200">
                <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} className="flex w-full items-center justify-between p-5 text-left">
                  <span className="font-medium text-slate-900 pr-4">{f.q}</span>
                  <ChevronDown className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5">
                    <p className="text-sm text-slate-600 leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-10 text-center text-white md:p-16">
          <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold md:text-4xl">Ready to get 3x more Google reviews?</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/85 text-lg">Join 500+ local businesses growing their Google presence with niuronai. Start your 14-day trial today.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={ctaHref}>
                <Button size="lg" className="bg-white px-8 text-violet-700 hover:bg-white/90 shadow-lg text-base">
                  Start 14-Day Trial — ₹199 <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#pricing">
                <Button size="lg" variant="outline" className="px-8 text-base border-white/30 text-white hover:bg-white/10">
                  Compare plans
                </Button>
              </a>
            </div>
            <p className="mt-4 text-sm text-white/60">No credit card required for trial • Cancel anytime • Full features from day 1</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-slate-500 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
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
