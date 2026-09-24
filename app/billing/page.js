'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import AppHeader, { AuthGate } from '@/components/app/AppHeader'
import { useRequireAuth } from '@/lib/useSession'
import { LIMIT_LABELS, FEATURE_LABELS } from '@/lib/plans'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { jsPDF } from 'jspdf'
import {
  Check, Crown, Loader2, Sparkles, Tag, Download, X, Infinity as InfinityIcon,
  CheckCircle2, Zap, FileText, Printer, Eye,
} from 'lucide-react'

const fmtINR = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')
const fetcher = (url) => fetch(url).then((r) => r.json())
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

function limitText(v) {
  if (v === -1) return 'Unlimited'
  return Number(v || 0).toLocaleString('en-IN')
}

function UsageMeter({ label, used, limit }) {
  const unlimited = limit === -1
  const pct = unlimited || !limit ? (used > 0 ? 6 : 0) : Math.min(100, Math.round((used / limit) * 100))
  const danger = !unlimited && limit > 0 && used / limit >= 0.9
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">
          {Number(used || 0).toLocaleString('en-IN')}<span className="text-slate-400"> / {unlimited ? '∞' : limitText(limit)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${danger ? 'bg-rose-500' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function BillingPage() {
  const { user, org, loading } = useRequireAuth()
  const { data: ent, mutate: mutateEnt } = useSWR('/api/me/entitlements', fetcher)
  const { data: plansRaw } = useSWR('/api/plans', fetcher)
  const { data: invoices, mutate: mutateInv } = useSWR('/api/billing/invoices', fetcher)

  const [interval, setInterval] = useState('monthly')
  const [checkoutPlan, setCheckoutPlan] = useState(null)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [coupon, setCoupon] = useState('')
  const [couponResult, setCouponResult] = useState(null)
  const [applying, setApplying] = useState(false)
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(null)

  const plans = Array.isArray(plansRaw) ? plansRaw : []
  const currentPlanId = ent?.plan?.id
  const sub = ent?.subscription

  const limitKeys = useMemo(() => Object.keys(ent?.limits || {}), [ent])

  useEffect(() => {
    // reset coupon state whenever the checkout plan/interval changes
    setCoupon(''); setCouponResult(null)
  }, [checkoutPlan, interval])

  const downloadInvoicePDF = (inv) => {
    try {
      const doc = new jsPDF()
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(124, 58, 237)
      doc.text('niuronai', 14, 22)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text('AI Google Business Profile & Local SEO SaaS', 14, 28)
      doc.text('niuronai Technologies HQ | Gurugram, Haryana', 14, 33)
      doc.text('GSTIN: 06AAACN1234F1Z5 | SAC: 998313', 14, 38)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(15, 23, 42)
      doc.text('TAX INVOICE', 140, 22)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(71, 85, 105)
      doc.text(`Invoice No: ${inv.number}`, 140, 29)
      doc.text(`Date: ${fmtDate(inv.issuedAt || inv.createdAt)}`, 140, 35)
      doc.text(`Status: PAID (${inv.gateway || 'online'})`, 140, 41)

      doc.setDrawColor(226, 232, 240)
      doc.line(14, 46, 196, 46)

      // Billed To
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('Billed To:', 14, 55)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(51, 65, 85)
      const buyerName = org?.billingProfile?.legalName || org?.name || user?.name || 'Customer'
      doc.text(buyerName, 14, 62)
      if (org?.billingProfile?.address) doc.text(org.billingProfile.address, 14, 68)
      const cityLine = [org?.billingProfile?.city, org?.billingProfile?.state, org?.billingProfile?.postalCode].filter(Boolean).join(', ')
      if (cityLine) doc.text(cityLine, 14, 74)
      if (org?.billingProfile?.gstin) doc.text(`GSTIN: ${org.billingProfile.gstin}`, 14, 80)

      // Items Table
      doc.setFillColor(248, 250, 252)
      doc.rect(14, 88, 182, 9, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105)
      doc.text('Description', 18, 94)
      doc.text('SAC', 110, 94)
      doc.text('Taxable', 140, 94)
      doc.text('Total', 175, 94)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(15, 23, 42)
      const itemDesc = `${inv.planName} Plan (${inv.interval || 'monthly'})`
      doc.text(itemDesc, 18, 106)
      doc.text('998313', 110, 106)
      doc.text(fmtINR(inv.subtotal - (inv.discount || 0)), 140, 106)
      doc.text(fmtINR(inv.total), 175, 106)

      doc.line(14, 114, 196, 114)

      // Totals
      doc.setFontSize(10)
      doc.setTextColor(100, 116, 139)
      doc.text('Subtotal:', 130, 124)
      doc.setTextColor(15, 23, 42)
      doc.text(fmtINR(inv.subtotal), 175, 124)

      if (inv.discount > 0) {
        doc.setTextColor(5, 150, 105)
        doc.text('Discount:', 130, 131)
        doc.text(`- ${fmtINR(inv.discount)}`, 175, 131)
      }

      doc.setTextColor(100, 116, 139)
      doc.text('GST (18%):', 130, 138)
      doc.setTextColor(15, 23, 42)
      doc.text(fmtINR(inv.tax), 175, 138)

      doc.setDrawColor(203, 213, 225)
      doc.line(130, 143, 196, 143)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(124, 58, 237)
      doc.text('Total Paid:', 130, 151)
      doc.text(fmtINR(inv.total), 175, 151)

      // Footer note
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(148, 163, 184)
      doc.text('This is a computer-generated tax invoice under Indian GST. No signature required.', 14, 175)
      doc.text('Thank you for trusting niuronai to power your local business growth.', 14, 181)

      doc.save(`${inv.number || 'Invoice'}.pdf`)
      toast.success('Invoice PDF downloaded')
    } catch (e) {
      console.error('PDF error', e)
      toast.error('Failed to generate PDF')
    }
  }

  if (loading || !user) return <AuthGate />

  const priceOf = (plan, itv) => plan?.prices?.INR?.[itv] || 0
  const subtotal = checkoutPlan ? priceOf(checkoutPlan, interval) : 0

  const applyCoupon = async () => {
    if (!coupon.trim()) return
    setApplying(true)
    try {
      const res = await fetch('/api/billing/coupon/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: checkoutPlan.id, interval, couponCode: coupon.trim() }),
      })
      const data = await res.json()
      if (!data.valid) { setCouponResult(null); toast.error(data.reason || 'Invalid coupon'); return }
      setCouponResult(data)
      toast.success(`Coupon applied — you save ${fmtINR(data.discount)}`)
    } catch (e) { toast.error('Could not validate coupon') } finally { setApplying(false) }
  }

  const loadRzp = () => new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve()
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Razorpay checkout'))
    document.body.appendChild(s)
  })

  const confirmOrder = async (payload) => {
    const cf = await fetch('/api/billing/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const done = await cf.json()
    if (!cf.ok) throw new Error(done.error || 'Payment failed')
    return done
  }

  const finishSuccess = (planName, done) => {
    setSuccess({ plan: planName, invoice: done.invoice })
    setCheckoutPlan(null)
    mutateEnt(); mutateInv()
  }

  const openRazorpay = async (order, planName) => {
    try { await loadRzp() } catch (e) { toast.error(e.message); setPaying(false); return }
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'niuronai',
      description: `${order.name} plan (${interval})`,
      order_id: order.razorpayOrderId,
      prefill: { email: user?.email || '', name: user?.name || '' },
      theme: { color: '#7c3aed' },
      handler: async (resp) => {
        try {
          const done = await confirmOrder({
            orderId: order.orderId,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_signature: resp.razorpay_signature,
          })
          finishSuccess(planName, done)
        } catch (e) { toast.error(e.message) } finally { setPaying(false) }
      },
      modal: { ondismiss: () => setPaying(false) },
    })
    rzp.on('payment.failed', (f) => { toast.error(f.error?.description || 'Payment failed'); setPaying(false) })
    rzp.open()
  }

  const pay = async () => {
    setPaying(true)
    const planName = checkoutPlan.name
    try {
      const co = await fetch('/api/billing/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: checkoutPlan.id, interval, couponCode: couponResult ? coupon.trim() : undefined }),
      })
      const order = await co.json()
      if (!co.ok) throw new Error(order.error || 'Checkout failed')
      if (order.gateway === 'razorpay' && !order.stub) {
        // Live Razorpay: open Checkout; confirmation happens in the handler.
        await openRazorpay(order, planName)
        return
      }
      // Stub gateway (no keys) or zero-amount plan/coupon: confirm immediately.
      const done = await confirmOrder({ orderId: order.orderId })
      finishSuccess(planName, done)
      setPaying(false)
    } catch (e) { toast.error(e.message); setPaying(false) }
  }

  const cancelSub = async () => {
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel')
      toast.success('Subscription set to cancel at period end')
      mutateEnt()
    } catch (e) { toast.error(e.message) }
  }

  const totals = couponResult?.totals

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader active="billing" />
      <main className="container py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Billing & plan</h1>
          <p className="text-sm text-slate-500">Manage your subscription, usage and invoices.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Current plan + usage */}
          <div className="space-y-6 lg:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Crown className="h-4 w-4 text-violet-600" /> Current plan</CardTitle>
                  <Badge className="bg-violet-600">{ent?.plan?.name || 'Free'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><span className="font-medium capitalize text-slate-900">{sub?.status || 'active'}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Renews / ends</span><span className="font-medium text-slate-900">{fmtDate(sub?.currentPeriodEnd)}</span></div>
                {sub?.cancelAtPeriodEnd && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Your plan will not renew and ends on {fmtDate(sub?.currentPeriodEnd)}.</div>
                )}
                {ent?.plan?.slug !== 'free' && !sub?.cancelAtPeriodEnd && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full text-rose-600 hover:text-rose-700">Cancel subscription</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                        <AlertDialogDescription>You'll keep {ent?.plan?.name} access until {fmtDate(sub?.currentPeriodEnd)}, then move to the Free plan. You can resubscribe anytime.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep plan</AlertDialogCancel>
                        <AlertDialogAction onClick={cancelSub} className="bg-rose-600 hover:bg-rose-700">Cancel subscription</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4 text-violet-600" /> Usage this period</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {limitKeys.length === 0 && <p className="text-sm text-slate-400">No usage data yet.</p>}
                {limitKeys.map((k) => (
                  <UsageMeter key={k} label={LIMIT_LABELS[k] || k} used={ent?.usage?.[k] || 0} limit={ent?.limits?.[k]} />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Plans + invoices */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Choose a plan</h2>
              <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 text-sm">
                <button onClick={() => setInterval('monthly')} className={`rounded-md px-3 py-1 font-medium ${interval === 'monthly' ? 'bg-violet-600 text-white' : 'text-slate-600'}`}>Monthly</button>
                <button onClick={() => setInterval('yearly')} className={`rounded-md px-3 py-1 font-medium ${interval === 'yearly' ? 'bg-violet-600 text-white' : 'text-slate-600'}`}>Yearly <span className="text-emerald-500">-16%</span></button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {plans.map((p) => {
                const price = priceOf(p, interval)
                const isCurrent = p.id === currentPlanId
                const featureList = Object.entries(p.features || {}).filter(([, v]) => v).map(([k]) => FEATURE_LABELS[k] || k)
                return (
                  <Card key={p.id} className={`relative flex flex-col ${p.popular ? 'border-violet-300 ring-1 ring-violet-200' : ''}`}>
                    {p.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">Most popular</span>}
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <CardDescription className="min-h-[32px] text-xs">{p.description}</CardDescription>
                      <div className="mt-1">
                        <span className="text-2xl font-bold text-slate-900">{price === 0 ? 'Free' : fmtINR(price)}</span>
                        {price > 0 && <span className="text-sm text-slate-400">/{interval === 'yearly' ? 'yr' : 'mo'}</span>}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                      <ul className="mb-4 space-y-1.5 text-xs text-slate-600">
                        {Object.entries(p.limits || {}).slice(0, 4).map(([k, v]) => (
                          <li key={k} className="flex items-center gap-1.5">
                            {v === -1 ? <InfinityIcon className="h-3.5 w-3.5 text-violet-500" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                            {limitText(v)} {LIMIT_LABELS[k] || k}
                          </li>
                        ))}
                        {featureList.slice(0, 2).map((f) => (
                          <li key={f} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> {f}</li>
                        ))}
                      </ul>
                      <div className="mt-auto">
                        {isCurrent ? (
                          <Button disabled variant="outline" className="w-full">Current plan</Button>
                        ) : (
                          <Button onClick={() => setCheckoutPlan(p)} className={`w-full ${p.popular ? 'bg-violet-600 hover:bg-violet-700' : ''}`} variant={p.popular ? 'default' : 'outline'}>
                            {price === 0 ? 'Switch to Free' : 'Choose plan'}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
              <CardContent>
                {(!invoices || invoices.length === 0) ? (
                  <p className="py-4 text-center text-sm text-slate-400">No invoices yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between py-3 text-sm hover:bg-slate-50/70 px-2 rounded-lg transition-colors">
                        <div>
                          <p className="font-semibold text-slate-900">{inv.number}</p>
                          <p className="text-xs text-slate-400">{inv.planName} · {inv.interval} · {fmtDate(inv.issuedAt || inv.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{fmtINR(inv.total)}</span>
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 capitalize">{inv.status}</Badge>
                          <Button size="sm" variant="outline" className="h-8 gap-1 ml-1" onClick={() => setSelectedInvoice(inv)}>
                            <FileText className="h-3.5 w-3.5 text-violet-600" />
                            <span className="hidden sm:inline">Tax Invoice</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Checkout dialog */}
      <Dialog open={!!checkoutPlan} onOpenChange={(o) => !o && setCheckoutPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Checkout — {checkoutPlan?.name} plan</DialogTitle>
            <DialogDescription>Billed {interval}. You can change or cancel anytime.</DialogDescription>
          </DialogHeader>
          {checkoutPlan && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-500">{checkoutPlan.name} ({interval})</span><span className="font-medium">{fmtINR(subtotal)}</span></div>
                {totals && (
                  <>
                    <div className="mt-1.5 flex items-center justify-between text-emerald-600"><span>Discount</span><span>- {fmtINR(totals.discount)}</span></div>
                    <div className="mt-1.5 flex items-center justify-between text-slate-500"><span>GST</span><span>{fmtINR(totals.tax)}</span></div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between text-base font-bold text-slate-900"><span>Total</span><span>{fmtINR(totals.total)}</span></div>
                  </>
                )}
                {!totals && subtotal > 0 && <p className="mt-1.5 text-xs text-slate-400">+ GST calculated at payment.</p>}
              </div>

              {subtotal > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-8" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
                  </div>
                  <Button variant="outline" onClick={applyCoupon} disabled={applying || !coupon.trim()}>
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                  </Button>
                </div>
              )}
              {couponResult && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Coupon “{coupon}” applied.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCheckoutPlan(null)}>Cancel</Button>
            <Button onClick={pay} disabled={paying} className="bg-violet-600 hover:bg-violet-700">
              {paying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</> : (subtotal > 0 ? `Pay ${fmtINR(totals ? totals.total : subtotal)}` : 'Confirm switch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={!!success} onOpenChange={(o) => !o && setSuccess(null)}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">You're on {success?.plan}!</h3>
            <p className="mt-1 text-sm text-slate-500">Your plan is active. Invoice {success?.invoice?.number} for {fmtINR(success?.invoice?.total)} has been generated.</p>
            <Button className="mt-5 w-full bg-violet-600 hover:bg-violet-700" onClick={() => setSuccess(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tax Invoice dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(o) => !o && setSelectedInvoice(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedInvoice && (
            <div className="space-y-6 py-2">
              <div className="flex items-start justify-between border-b pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tracking-tight text-violet-700">niuron<span className="text-cyan-500">ai</span></span>
                    <Badge variant="outline" className="text-xs uppercase">GST Invoice</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">niuronai Technologies HQ · Cyber City, Gurugram, Haryana</p>
                  <p className="text-xs text-slate-500">GSTIN: 06AAACN1234F1Z5 · SAC: 998313</p>
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-bold text-slate-900">{selectedInvoice.number}</h3>
                  <p className="text-xs text-slate-500">Date: {fmtDate(selectedInvoice.issuedAt || selectedInvoice.createdAt)}</p>
                  <Badge className="mt-1 bg-emerald-600">PAID</Badge>
                </div>
              </div>

              {/* Bill To */}
              <div className="rounded-lg bg-slate-50 p-3.5 text-xs text-slate-600">
                <p className="font-semibold uppercase tracking-wider text-slate-400">Billed To</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {org?.billingProfile?.legalName || org?.name || user?.name || 'Customer'}
                </p>
                {org?.billingProfile?.address && <p className="mt-0.5">{org.billingProfile.address}</p>}
                <p className="mt-0.5">
                  {[org?.billingProfile?.city, org?.billingProfile?.state, org?.billingProfile?.postalCode, org?.billingProfile?.country || 'India'].filter(Boolean).join(', ')}
                </p>
                {org?.billingProfile?.gstin ? (
                  <p className="mt-1 font-semibold text-slate-800">GSTIN: {org.billingProfile.gstin}</p>
                ) : (
                  <p className="mt-1 text-slate-400 italic">No buyer GSTIN registered (Unregistered Consumer)</p>
                )}
              </div>

              {/* Items Breakdown */}
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-center">SAC Code</th>
                      <th className="p-3 text-right">Taxable</th>
                      <th className="p-3 text-right">GST (18%)</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-3 font-medium text-slate-900">
                        {selectedInvoice.planName} Plan ({selectedInvoice.interval || 'monthly'})
                      </td>
                      <td className="p-3 text-center text-slate-500">998313</td>
                      <td className="p-3 text-right text-slate-700">
                        {fmtINR(selectedInvoice.subtotal - (selectedInvoice.discount || 0))}
                      </td>
                      <td className="p-3 text-right text-slate-700">{fmtINR(selectedInvoice.tax)}</td>
                      <td className="p-3 text-right font-bold text-slate-900">{fmtINR(selectedInvoice.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Summary Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-medium text-slate-900">{fmtINR(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Coupon Discount:</span>
                      <span className="font-semibold">- {fmtINR(selectedInvoice.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>CGST (9%):</span>
                    <span className="text-slate-900">{fmtINR(Math.round(selectedInvoice.tax / 2))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST (9%):</span>
                    <span className="text-slate-900">{fmtINR(Math.round(selectedInvoice.tax / 2))}</span>
                  </div>
                  <Separator className="my-1.5" />
                  <div className="flex justify-between text-sm font-bold text-slate-900">
                    <span>Total Paid:</span>
                    <span className="text-violet-700">{fmtINR(selectedInvoice.total)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800">
                This is a computer-generated tax invoice issued in compliance with Indian GST laws. SAC: 998313 (Information Technology Software Services).
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" className="gap-1.5" onClick={() => downloadInvoicePDF(selectedInvoice)}>
                  <Download className="h-4 w-4 text-violet-600" /> Download PDF
                </Button>
                <Button variant="ghost" onClick={() => setSelectedInvoice(null)}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
