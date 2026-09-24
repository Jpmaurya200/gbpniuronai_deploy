'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import AppHeader, { AuthGate } from '@/components/app/AppHeader'
import { useRequireAuth } from '@/lib/useSession'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sparkles, Star, Search, Copy, RefreshCw, Send, MessageSquare, Loader2,
  Smile, Meh, Frown, Inbox, CheckCircle2, Zap, Bot, Wand2, ShieldCheck,
} from 'lucide-react'

const TONES = ['Professional', 'Friendly', 'Warm', 'Premium', 'Minimal', 'Local', 'Empathetic']
const LENGTHS = [
  { v: 'short', l: 'Short' },
  { v: 'standard', l: 'Standard' },
  { v: 'detailed', l: 'Detailed' },
]

const sentimentMeta = {
  positive: { icon: Smile, cls: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Positive' },
  neutral: { icon: Meh, cls: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Neutral' },
  negative: { icon: Frown, cls: 'text-red-600 bg-red-50 border-red-200', label: 'Negative' },
}

function Stars({ n }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= n ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
      ))}
    </div>
  )
}

export default function ReviewsPage() {
  const { user, loading: authLoading } = useRequireAuth()
  const [campaigns, setCampaigns] = useState([])
  const [reviews, setReviews] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const [campaignId, setCampaignId] = useState('all')
  const [status, setStatus] = useState('all')
  const [sentiment, setSentiment] = useState('all')
  const [rating, setRating] = useState('all')
  const [q, setQ] = useState('')

  // per-review UI state
  const [drafts, setDrafts] = useState({}) // id -> reply text
  const [tones, setTones] = useState({}) // id -> tone
  const [lengths, setLengths] = useState({}) // id -> length
  const [busy, setBusy] = useState({}) // id -> 'gen'|'pub'
  const [autoBusy, setAutoBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)

  const loadCampaigns = async () => {
    const res = await fetch('/api/campaigns')
    const data = await res.json()
    setCampaigns(Array.isArray(data) ? data : [])
  }

  const loadReviews = async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (campaignId !== 'all') p.set('campaignId', campaignId)
      if (status !== 'all') p.set('status', status)
      if (sentiment !== 'all') p.set('sentiment', sentiment)
      if (rating !== 'all') p.set('rating', rating)
      if (q.trim()) p.set('q', q.trim())
      const res = await fetch(`/api/reviews?${p.toString()}`)
      const data = await res.json()
      setReviews(data.reviews || [])
      setStats(data.stats || null)
      const d = {}, t = {}, l = {}
      ;(data.reviews || []).forEach((r) => { d[r.id] = r.reply || ''; t[r.id] = r.replyTone || 'Professional'; l[r.id] = 'standard' })
      setDrafts(d); setTones(t); setLengths(l)
    } catch (e) {
      toast.error('Failed to load reviews')
    } finally { setLoading(false) }
  }

  useEffect(() => { if (user) loadCampaigns() }, [user])
  useEffect(() => { if (user) loadReviews() /* eslint-disable-next-line */ }, [user, campaignId, status, sentiment, rating])

  const seedReviews = async () => {
    const res = await fetch('/api/reviews/seed', { method: 'POST' })
    const data = await res.json()
    if (res.ok) { toast.success(`Loaded ${data.created} demo reviews`); loadReviews() }
    else toast.error('Could not load reviews')
  }

  const syncGoogleReviews = async () => {
    setSyncBusy(true)
    try {
      const res = await fetch('/api/gbp/sync-reviews', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.includes('not connected')) {
          toast.info('Connect your Google Business Profile in Account settings to sync live reviews.')
        } else {
          toast.error(data.error || 'Failed to sync Google reviews')
        }
        return
      }
      toast.success(data.message || 'Google reviews synced successfully')
      loadReviews()
    } catch (e) {
      toast.error('Network error during Google review sync')
    } finally {
      setSyncBusy(false)
    }
  }

  const runAutomation = async () => {
    setAutoBusy(true)
    try {
      const res = await fetch('/api/reviews/automate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaignId !== 'all' ? campaignId : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (data.processed === 0 && data.skipped > 0) {
        toast.message('Turn on automation first: Campaigns → Edit → Automation')
      } else if (data.processed === 0) {
        toast.message('No pending reviews to process')
      } else {
        toast.success(`Automation ran: ${data.published} auto-published, ${data.queued} queued for approval`)
      }
      loadReviews()
    } catch (e) { toast.error(e.message) } finally { setAutoBusy(false) }
  }

  const simulateReview = async () => {
    const cid = campaignId !== 'all' ? campaignId : campaigns[0]?.id
    if (!cid) { toast.error('Create a campaign first'); return }
    setAutoBusy(true)
    try {
      const res = await fetch(`/api/campaigns/${cid}/simulate-review`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      const a = data.autoAction
      if (a === 'auto_published') toast.success('New 5★ review arrived → AI reply auto-published ✓')
      else if (a === 'queued') toast.message('New review arrived → AI reply drafted, awaiting your approval')
      else toast.message('New review added — enable automation to auto-handle it')
      loadReviews()
    } catch (e) { toast.error(e.message) } finally { setAutoBusy(false) }
  }

  const generateReply = async (r) => {
    setBusy((b) => ({ ...b, [r.id]: 'gen' }))
    try {
      const res = await fetch(`/api/reviews/${r.id}/generate-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: tones[r.id], length: lengths[r.id] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setDrafts((d) => ({ ...d, [r.id]: data.reply }))
      toast.success('AI reply generated')
    } catch (e) { toast.error(e.message) } finally { setBusy((b) => ({ ...b, [r.id]: null })) }
  }

  const publishReply = async (r) => {
    const reply = (drafts[r.id] || '').trim()
    if (!reply) { toast.error('Generate or write a reply first'); return }
    setBusy((b) => ({ ...b, [r.id]: 'pub' }))
    try {
      const res = await fetch(`/api/reviews/${r.id}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply, replyTone: tones[r.id] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success('Reply published')
      loadReviews()
    } catch (e) { toast.error(e.message) } finally { setBusy((b) => ({ ...b, [r.id]: null })) }
  }

  const filtered = useMemo(() => reviews, [reviews])

  if (authLoading || !user) return <AuthGate />

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader active="reviews" />

      <main className="container py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Review Inbox</h1>
            <p className="text-sm text-slate-500">Reply to Google reviews with AI — on-brand, in seconds.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={syncGoogleReviews} disabled={syncBusy || autoBusy}>
              {syncBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Sync Google Reviews
            </Button>
            {reviews.length > 0 && (
              <>
                <Button variant="outline" onClick={simulateReview} disabled={autoBusy || syncBusy}>
                  <Wand2 className="mr-1 h-4 w-4" /> Simulate review
                </Button>
                <Button onClick={runAutomation} disabled={autoBusy || syncBusy} className="bg-violet-600 hover:bg-violet-700">
                  {autoBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Bot className="mr-1 h-4 w-4" />} Run automation
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Total Reviews', value: stats.total, icon: MessageSquare, tint: 'text-blue-600 bg-blue-50' },
              { label: 'Needs Reply', value: stats.unanswered, icon: Inbox, tint: 'text-amber-600 bg-amber-50' },
              { label: 'Avg Rating', value: stats.avgRating, icon: Star, tint: 'text-yellow-600 bg-yellow-50' },
              { label: 'Response Rate', value: `${stats.responseRate}%`, icon: CheckCircle2, tint: 'text-emerald-600 bg-emerald-50' },
            ].map((s) => (
              <Card key={s.label} className="border-slate-200">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.tint}`}><s.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All locations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.businessName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="unanswered">Needs reply</SelectItem>
              <SelectItem value="awaiting">Awaiting approval</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sentiment} onValueChange={setSentiment}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sentiment</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{n} star</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadReviews()} placeholder="Search reviews..." className="pl-9" />
          </div>
          <Button variant="outline" onClick={loadReviews}>Search</Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="mt-6 space-y-4">{[1, 2, 3].map((i) => <Card key={i} className="h-40 animate-pulse bg-slate-100" />)}</div>
        ) : filtered.length === 0 ? (
          <Card className="mt-6 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><MessageSquare className="h-7 w-7" /></div>
              <h3 className="text-lg font-semibold text-slate-900">No reviews yet</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Sync live reviews directly from your Google Business Profile, or load demo reviews to try the AI reply engine.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={syncGoogleReviews} disabled={syncBusy} variant="outline">
                  {syncBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Sync Google Reviews
                </Button>
                <Button onClick={seedReviews} className="bg-violet-600 hover:bg-violet-700">
                  <Zap className="mr-1 h-4 w-4" /> Load demo reviews
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 space-y-4">
            {filtered.map((r) => {
              const sm = sentimentMeta[r.sentiment] || sentimentMeta.neutral
              const SIcon = sm.icon
              const isPub = r.replyStatus === 'published'
              return (
                <Card key={r.id} className="border-slate-200">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">{r.reviewerName?.[0] || '?'}</div>
                        <div>
                          <p className="font-semibold text-slate-900">{r.reviewerName}</p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <Stars n={r.rating} />
                            <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.source === 'google' && (
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Google</Badge>
                        )}
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${sm.cls}`}><SIcon className="h-3.5 w-3.5" /> {sm.label}</span>
                        {isPub
                          ? (r.autoAction === 'auto_published'
                              ? <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100"><Bot className="mr-1 h-3 w-3" /> Auto-published</Badge>
                              : <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Replied</Badge>)
                          : (r.autoAction === 'queued'
                              ? <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><ShieldCheck className="mr-1 h-3 w-3" /> Awaiting approval</Badge>
                              : <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-100">Needs reply</Badge>)}
                      </div>
                    </div>

                    <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{r.text}</p>
                    {r.topics?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.topics.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{t}</span>)}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">{r.businessName}</p>

                    {/* Reply area */}
                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      {isPub ? (
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Published reply</p>
                            {r.googleSynced && (
                              <span className="text-[11px] font-medium text-emerald-600">✓ Posted to Google</span>
                            )}
                            {r.googleError && (
                              <span className="text-[11px] font-medium text-amber-600" title={r.googleError}>⚠ Google notice: {r.googleError}</span>
                            )}
                          </div>
                          <p className="text-sm text-slate-700">{r.reply}</p>
                        </div>
                      ) : (
                        <>
                          {r.autoAction === 'queued' && (
                            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-600"><Bot className="h-3.5 w-3.5" /> AI-drafted reply — review, edit and approve</p>
                          )}
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Select value={tones[r.id]} onValueChange={(v) => setTones((s) => ({ ...s, [r.id]: v }))}>
                              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={lengths[r.id]} onValueChange={(v) => setLengths((s) => ({ ...s, [r.id]: v }))}>
                              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{LENGTHS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => generateReply(r)} disabled={busy[r.id] === 'gen'}>
                              {busy[r.id] === 'gen' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5 text-violet-600" />}
                              {drafts[r.id] ? 'Regenerate' : 'Generate reply'}
                            </Button>
                          </div>
                          <Textarea
                            value={drafts[r.id] || ''}
                            onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                            rows={3}
                            placeholder="Generate an AI reply, or write your own..."
                            className="resize-none bg-white text-sm"
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700" onClick={() => publishReply(r)} disabled={busy[r.id] === 'pub'}>
                              {busy[r.id] === 'pub' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} {r.autoAction === 'queued' ? 'Approve & Publish' : 'Publish'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => { navigator.clipboard.writeText(drafts[r.id] || ''); toast.success('Reply copied') }}>
                              <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        niuronai — AI review replies grounded in your real business context. Publishing here is a demo action.
      </footer>
    </div>
  )
}
