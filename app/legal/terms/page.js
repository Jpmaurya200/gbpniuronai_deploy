import Link from 'next/link'
import { Sparkles, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service - Niuron AI',
  description: 'Terms of Service for Niuron AI platform',
}

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: September 26, 2026</p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-900">1. Acceptance of Terms</h2>
              <p className="mt-2">
                By accessing or using the Niuron AI website and services (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">2. Description of Service</h2>
              <p className="mt-2">
                Niuron AI provides software tools to manage Google Business Profile locations, generate customer review campaigns, analyze feedback, and publish AI-assisted review replies.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">3. User Responsibilities & Account Security</h2>
              <p className="mt-2">
                You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree not to use the Service for any unlawful or abusive activities.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">4. Third-Party Integrations</h2>
              <p className="mt-2">
                Our Service integrates with third-party providers including Google APIs and OpenRouter AI. Your use of third-party features is subject to the applicable terms and privacy policies of those third-party services.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">5. Limitation of Liability</h2>
              <p className="mt-2">
                Niuron AI is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind. In no event shall Niuron AI be liable for any indirect, incidental, special, consequential, or punitive damages.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">6. Contact</h2>
              <p className="mt-2">
                For questions regarding these Terms, contact us at: <b>support@niuronai.com</b>.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
