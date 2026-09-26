import Link from 'next/link'
import { Sparkles, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Refund Policy - Niuron AI',
  description: 'Refund Policy for Niuron AI platform',
}

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="container mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-bold text-slate-900">Niuron AI</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 md:p-12 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Refund Policy</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: September 26, 2026</p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-900">1. Subscriptions & Billing</h2>
              <p className="mt-2">
                Niuron AI provides monthly and annual subscription plans. Subscriptions renew automatically at the end of each billing cycle unless cancelled prior to renewal.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">2. Refund Eligibility</h2>
              <p className="mt-2">
                If you are dissatisfied with our service or experience technical issues that prevent you from using the platform, you may request a full refund within <b>7 days</b> of your initial subscription purchase.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">3. Cancellation</h2>
              <p className="mt-2">
                You can cancel your subscription at any time via the Billing section of your Account. Cancellation takes effect at the end of the current billing cycle.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">4. Contact Us</h2>
              <p className="mt-2">
                To request a refund or ask questions about your billing, please email: <b>support@niuronai.com</b>.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
