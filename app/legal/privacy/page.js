import Link from 'next/link'
import { Sparkles, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy - Niuron AI',
  description: 'Privacy Policy for Niuron AI reputation management platform',
}

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: September 26, 2026</p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-900">1. Introduction</h2>
              <p className="mt-2">
                Niuron AI (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides an AI-powered local business reputation and customer review management platform. We are committed to protecting your privacy and ensuring your personal information is handled safely and responsibly.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">2. Information We Collect</h2>
              <p className="mt-2">
                We collect information to provide and improve our services:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li><b>Account Information:</b> Name, email address, password hash, and business details provided during registration.</li>
                <li><b>Google User & Business Data:</b> When you authorize Google Sign-In or Google Business Profile connection, we receive your Google ID, name, email, profile photo, and authorized Google Business Profile locations and reviews.</li>
                <li><b>Usage Data:</b> Log data, interaction metrics, and review management activities within the platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">3. Google API Data & Compliance (Limited Use Disclosure)</h2>
              <p className="mt-2">
                Niuron AI uses Google APIs (including Google Business Profile APIs and Google Sign-In) to allow users to view business locations, read customer reviews, and publish review replies.
              </p>
              <p className="mt-2">
                Niuron AI&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{' '}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline hover:text-violet-700">
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>We do not sell Google user data to third parties.</li>
                <li>We do not use Google user data for advertising purposes.</li>
                <li>Tokens and authorization credentials are encrypted using AES-256 encryption at rest.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">4. How We Use Information</h2>
              <p className="mt-2">We use collected information to:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Provide, operate, and maintain the Niuron AI platform.</li>
                <li>Sync Google Business Profile listings and customer reviews.</li>
                <li>Generate AI-assisted review replies upon user request.</li>
                <li>Send transactional emails, alerts, and platform notifications.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">5. Data Retention & Deletion</h2>
              <p className="mt-2">
                You can disconnect your Google Business Profile account at any time in Account Settings. Disconnecting removes your access tokens immediately. You may request full account and data deletion by contacting us at support@niuronai.com.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">6. Contact Us</h2>
              <p className="mt-2">
                If you have questions regarding this Privacy Policy, please contact us at: <b>support@niuronai.com</b>.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
