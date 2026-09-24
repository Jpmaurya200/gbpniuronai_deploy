'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import AppHeader, { AuthGate } from '@/components/app/AppHeader'
import { useRequireAuth } from '@/lib/useSession'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { jsPDF } from 'jspdf'
import {
  Sparkles, Gauge, Copy, Trash2, ChevronDown, ChevronRight, Search, Building2,
  Star, TrendingUp, ListChecks, Tag, Type, CheckCircle2, XCircle, ArrowUpRight, Loader2, RefreshCw, Plus,
  Download, Wand2,
} from 'lucide-react'

const CAT_META = {
  profileCompleteness: { icon: ListChecks, tint: 'text-blue-600 bg-blue-50' },
  reviewsReputation: { icon: Star, tint: 'text-amber-600 bg-amber-50' },
  keywordsSeo: { icon: Search, tint: 'text-violet-600 bg-violet-50' },
  engagement: { icon: TrendingUp, tint: 'text-emerald-600 bg-emerald-50' },
}

const scoreColor = (s) => (s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-red-600')
const scoreBar = (s) => (s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-amber-500' : 'bg-red-500')
const scoreRing = (s) => (s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444')
const impactTint = (i) => (i === 'high' ? 'bg-red-100 text-red-700' : i === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')
const effortTint = (e) => (e === 'low' ? 'bg-emerald-100 text-emerald-700' : e === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')

function Sparkline({ data, width = 520, height = 140 }) {
  const pad = 16
  const scores = data.map((d) => d.score)
  const max = 100
  const min = Math.max(0, Math.min(...scores) - 10)
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0
  const y = (s) => height - pad - ((s - min) / (max - min || 1)) * (height - pad * 2)
  const pts = data.map((d, i) => [pad + i * stepX, y(d.score)])
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${height - pad} L${pts[0][0].toFixed(1)},${height - pad} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c3aed" stopOpacity="0.25" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={path} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3.5" fill="#7c3aed" />
          <text x={p[0]} y={p[1] - 9} textAnchor="middle" fontSize="11" fontWeight="600" fill="#7c3aed">{data[i].score}</text>
          <text x={p[0]} y={height - 3} textAnchor="middle" fontSize="10" fill="#94a3b8">{data[i].date}</text>
        </g>
      ))}
    </svg>
  )
}

function ScoreRing({ score, size = 168 }) {
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#eef2f7" strokeWidth="12" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={scoreRing(score)} strokeWidth="12" fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-extrabold ${scoreColor(score)}`}>{score}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">/ 100</span>
      </div>
    </div>
  )
}

const emptyManual = {
  businessName: '', category: '', city: '', services: '', description: '', googleReviewUrl: '',
  website: '', phone: '', hasHours: false, photoCount: 0, avgRating: '', reviewCount: '', responseRate: '',
}

export default function AuditPage() {
  const { user, loading: authLoading } = useRequireAuth()
  const [campaigns, setCampaigns] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('campaign') // 'campaign' | 'manual'
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [manual, setManual] = useState(emptyManual)
  const [running, setRunning] = useState(false)
  const [audit, setAudit] = useState(null)
  const [openRec, setOpenRec] = useState({})

  const loadAll = async () => {
    setLoading(true)
    try {
      const [cRes, aRes] = await Promise.all([fetch('/api/campaigns'), fetch('/api/audits')])
      const cData = await cRes.json()
      const aData = await aRes.json()
      setCampaigns(Array.isArray(cData) ? cData : [])
      setHistory(Array.isArray(aData) ? aData : [])
      if (Array.isArray(cData) && cData.length && !selectedCampaignId) setSelectedCampaignId(cData[0].id)
      if (Array.isArray(aData) && aData.length && !audit) setAudit(aData[0])
    } catch (e) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (user) loadAll() }, [user])

  const runCampaignAudit = async () => {
    if (!selectedCampaignId) { toast.error('Choose a business first'); return }
    await run({ campaignId: selectedCampaignId })
  }
  const runManualAudit = async () => {
    if (!manual.businessName.trim()) { toast.error('Business name is required'); return }
    await run(manual)
  }
  const run = async (payload) => {
    setRunning(true)
    try {
      const res = await fetch('/api/audits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Audit failed')
      setAudit(data)
      setHistory((h) => [data, ...h])
      setOpenRec({})
      toast.success(`Audit complete — score ${data.overallScore}/100 (${data.grade})`)
    } catch (e) { toast.error(e.message) } finally { setRunning(false) }
  }

  const removeAudit = async (id) => {
    await fetch(`/api/audits/${id}`, { method: 'DELETE' })
    setHistory((h) => h.filter((a) => a.id !== id))
    if (audit?.id === id) setAudit(null)
    toast.success('Audit deleted')
  }

  const copy = (text, label = 'Copied') => { navigator.clipboard.writeText(text); toast.success(label) }

  const [applying, setApplying] = useState(false)
  const applyAuditToCampaign = async () => {
    if (!audit?.campaignId) return
    setApplying(true)
    try {
      const res = await fetch(`/api/audits/${audit.id}/apply`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to apply audit to campaign')
      toast.success('AI description & keywords applied to campaign!')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setApplying(false)
    }
  }

  const downloadAuditPDF = (aud) => {
    if (!aud) return
    try {
      const doc = new jsPDF()
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(124, 58, 237)
      doc.text('niuronai', 14, 20)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text('Local SEO & Google Business Profile Audit Scorecard', 14, 26)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(15, 23, 42)
      doc.text(aud.businessName || 'Business Audit', 14, 38)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(71, 85, 105)
      doc.text(`${aud.category || 'Local Business'} · ${aud.city || ''}`, 14, 44)
      doc.text(`Audit Date: ${new Date(aud.createdAt).toLocaleDateString()}`, 14, 50)

      // Score block
      doc.setFillColor(248, 250, 252)
      doc.rect(140, 14, 56, 38, 'F')
      doc.setDrawColor(226, 232, 240)
      doc.rect(140, 14, 56, 38, 'S')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(124, 58, 237)
      doc.text(`${aud.overallScore}/100`, 146, 30)

      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text(`Grade: ${aud.grade}`, 146, 42)

      doc.setDrawColor(226, 232, 240)
      doc.line(14, 56, 196, 56)

      // Executive Summary
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('Executive Summary', 14, 66)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(51, 65, 85)
      const splitSummary = doc.splitTextToSize(aud.aiSummary || 'No summary available.', 182)
      doc.text(splitSummary, 14, 73)

      let yPos = 73 + splitSummary.length * 5 + 6

      // Category Sub-scores
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('Category Health Scores', 14, yPos)
      yPos += 7

      const cats = [
        ['Profile Completeness', aud.categories?.profileCompleteness?.score ?? '—'],
        ['Reviews & Reputation', aud.categories?.reviewsReputation?.score ?? '—'],
        ['Keywords & SEO', aud.categories?.keywordsSeo?.score ?? '—'],
        ['Customer Engagement', aud.categories?.engagement?.score ?? '—'],
      ]

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      cats.forEach(([label, score]) => {
        doc.setTextColor(71, 85, 105)
        doc.text(`• ${label}:`, 18, yPos)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(15, 23, 42)
        doc.text(`${score}/100`, 85, yPos)
        doc.setFont('helvetica', 'normal')
        yPos += 6
      })

      yPos += 6

      // Priority Action Plan
      if (Array.isArray(aud.recommendations) && aud.recommendations.length) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(15, 23, 42)
        doc.text('Top Priority Action Plan', 14, yPos)
        yPos += 7

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        aud.recommendations.slice(0, 5).forEach((rec, idx) => {
          if (yPos > 260) { doc.addPage(); yPos = 20 }
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(15, 23, 42)
          doc.text(`${idx + 1}. ${rec.title} [Impact: ${(rec.impact || 'medium').toUpperCase()} | Effort: ${(rec.effort || 'low').toUpperCase()}]`, 14, yPos)
          yPos += 5
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(71, 85, 105)
          const how = doc.splitTextToSize(`Action: ${rec.howTo || rec.why || ''}`, 180)
          doc.text(how, 18, yPos)
          yPos += how.length * 4.5 + 4
        })
      }

      // Footer
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text('Generated by niuronai AI Local SEO Audit Engine. https://niuron.ai', 14, 285)

      doc.save(`Audit_${(aud.businessName || 'Business').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
      toast.success('Audit Report PDF downloaded')
    } catch (e) {
      console.error('Audit PDF error', e)
      toast.error('Failed to generate audit PDF')
    }
  }

  // trend: audits sharing this audit's campaignId (or business name for manual)
  const trend = useMemo(() => {
    if (!audit) return []
    const key = audit.campaignId
    const rows = history
      .filter((a) => (key ? a.campaignId === key : (!a.campaignId && a.businessName === audit.businessName)))
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((a) => ({ date: new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), score: a.overallScore }))
    return rows
  }, [audit, history])

  const prevScore = trend.length >= 2 ? trend[trend.length - 2].score : null
  const delta = prevScore != null && audit ? audit.overallScore - prevScore : null

  if (authLoading || !user) return <AuthGate />

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader active="audit" />

      <main className="container py-8">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-8 text-white shadow-xl md:p-10">
          <div className="relative z-10 max-w-2xl">
            <Badge className="mb-4 border-0 bg-white/15 text-white hover:bg-white/25">Local SEO Audit</Badge>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">Score &amp; optimize your Google Business Profile with AI</h1>
            <p className="mt-3 text-white/85">Get an instant health score across profile completeness, reviews, keywords and engagement — plus a prioritized, actionable plan to rank higher locally.</p>
          </div>
          <Gauge className="pointer-events-none absolute -right-6 -top-6 h-48 w-48 text-white/10" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Left: run + history */}
          <div className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Run an audit</CardTitle>
                <CardDescription>Audit an existing business or enter details manually.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                  <button onClick={() => setMode('campaign')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === 'campaign' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>My business</button>
                  <button onClick={() => setMode('manual')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Manual entry</button>
                </div>

                {mode === 'campaign' ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Choose a business</Label>
                      <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                        <SelectTrigger><SelectValue placeholder="Select a campaign" /></SelectTrigger>
                        <SelectContent>
                          {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.businessName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {campaigns.length === 0 && <p className="text-[11px] text-slate-500">No campaigns yet — create one on the Campaigns page, or use manual entry.</p>}
                    </div>
                    <Button onClick={runCampaignAudit} disabled={running || !selectedCampaignId} className="w-full bg-violet-600 hover:bg-violet-700">
                      {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Auditing...</> : <><Gauge className="mr-2 h-4 w-4" /> Run AI Audit</>}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5"><Label>Business name *</Label><Input value={manual.businessName} onChange={(e) => setManual({ ...manual, businessName: e.target.value })} placeholder="e.g. Coastal Yoga Studio" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5"><Label>Category</Label><Input value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value })} placeholder="Yoga Studio" /></div>
                      <div className="space-y-1.5"><Label>City</Label><Input value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} placeholder="Goa" /></div>
                    </div>
                    <div className="space-y-1.5"><Label>Services (comma separated)</Label><Input value={manual.services} onChange={(e) => setManual({ ...manual, services: e.target.value })} placeholder="Hatha Yoga, Meditation" /></div>
                    <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} placeholder="Current Google Business description..." /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5"><Label>Website</Label><Input value={manual.website} onChange={(e) => setManual({ ...manual, website: e.target.value })} placeholder="https://" /></div>
                      <div className="space-y-1.5"><Label>Phone</Label><Input value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} placeholder="+91 ..." /></div>
                    </div>
                    <div className="space-y-1.5"><Label>Google review link</Label><Input value={manual.googleReviewUrl} onChange={(e) => setManual({ ...manual, googleReviewUrl: e.target.value })} placeholder="https://search.google.com/local/writereview?..." /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5"><Label>Photos count</Label><Input type="number" value={manual.photoCount} onChange={(e) => setManual({ ...manual, photoCount: e.target.value })} /></div>
                      <div className="flex items-end justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-700">Hours set</span>
                        <Switch checked={manual.hasHours} onCheckedChange={(v) => setManual({ ...manual, hasHours: v })} />
                      </div>
                    </div>
                    <Separator />
                    <p className="text-[11px] font-medium text-slate-500">Review signals (optional)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5"><Label className="text-xs">Avg rating</Label><Input type="number" step="0.1" value={manual.avgRating} onChange={(e) => setManual({ ...manual, avgRating: e.target.value })} placeholder="4.6" /></div>
                      <div className="space-y-1.5"><Label className="text-xs"># Reviews</Label><Input type="number" value={manual.reviewCount} onChange={(e) => setManual({ ...manual, reviewCount: e.target.value })} placeholder="30" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Reply %</Label><Input type="number" value={manual.responseRate} onChange={(e) => setManual({ ...manual, responseRate: e.target.value })} placeholder="40" /></div>
                    </div>
                    <Button onClick={runManualAudit} disabled={running} className="w-full bg-violet-600 hover:bg-violet-700">
                      {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Auditing...</> : <><Gauge className="mr-2 h-4 w-4" /> Run AI Audit</>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* History */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3"><CardTitle className="text-base">Audit history</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  [1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)
                ) : history.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">No audits yet. Run your first audit above.</p>
                ) : (
                  history.map((a) => (
                    <button key={a.id} onClick={() => { setAudit(a); setOpenRec({}) }} className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition ${audit?.id === a.id ? 'border-violet-300 bg-violet-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${scoreColor(a.overallScore)} bg-white ring-1 ring-slate-200`}>{a.grade}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{a.businessName}</p>
                        <p className="text-[11px] text-slate-400">{new Date(a.createdAt).toLocaleDateString()} · {a.overallScore}/100{a.campaignId ? '' : ' · manual'}</p>
                      </div>
                      <Trash2 onClick={(e) => { e.stopPropagation(); removeAudit(a.id) }} className="h-4 w-4 shrink-0 text-slate-300 hover:text-red-600" />
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: results */}
          <div className="space-y-6">
            {!audit ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Gauge className="h-7 w-7" /></div>
                  <h3 className="text-lg font-semibold text-slate-900">Run an audit to see your scorecard</h3>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">Pick a business or enter details, then run the AI audit to get your Local SEO score and improvement plan.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Scorecard header */}
                <Card className="overflow-hidden border-slate-200">
                  <div className="h-1.5 bg-gradient-to-r from-violet-500 to-indigo-500" />
                  <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
                    <div className="flex flex-col items-center">
                      <ScoreRing score={audit.overallScore} />
                      <div className="mt-2 flex items-center gap-2">
                        <Badge className={`border-0 text-base ${scoreColor(audit.overallScore)} bg-slate-100`}>Grade {audit.grade}</Badge>
                        {delta != null && (
                          <span className={`flex items-center gap-0.5 text-xs font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            <ArrowUpRight className={`h-3.5 w-3.5 ${delta < 0 ? 'rotate-90' : ''}`} /> {delta >= 0 ? '+' : ''}{delta} vs last
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <h2 className="text-xl font-bold text-slate-900">{audit.businessName}</h2>
                        {audit.category && <Badge variant="secondary">{audit.category}</Badge>}
                        {audit.city && <span className="text-sm text-slate-500">· {audit.city}</span>}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{audit.aiSummary}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => audit.campaignId ? run({ campaignId: audit.campaignId }) : run({ ...audit, ...audit.profile, services: audit.services, avgRating: audit.reviewSignals?.avgRating, reviewCount: audit.reviewSignals?.reviewCount, responseRate: audit.reviewSignals?.responseRate })} disabled={running}>
                          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} /> Re-run
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadAuditPDF(audit)} className="gap-1.5">
                          <Download className="h-3.5 w-3.5 text-violet-600" /> Download PDF Report
                        </Button>
                        {audit.campaignId && (
                          <Button size="sm" onClick={applyAuditToCampaign} disabled={applying} className="bg-violet-600 hover:bg-violet-700 gap-1.5">
                            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                            Apply to Campaign
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Category sub-scores */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {['profileCompleteness', 'reviewsReputation', 'keywordsSeo', 'engagement'].map((k) => {
                    const cat = audit.categories?.[k]
                    if (!cat) return null
                    const Meta = CAT_META[k]
                    const Icon = Meta.icon
                    return (
                      <Card key={k} className="border-slate-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${Meta.tint}`}><Icon className="h-4 w-4" /></div>
                              <span className="text-sm font-semibold text-slate-800">{cat.label}</span>
                            </div>
                            <span className={`text-lg font-bold ${scoreColor(cat.score)}`}>{cat.score}</span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${scoreBar(cat.score)}`} style={{ width: `${cat.score}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{cat.detail}</p>
                          {k === 'profileCompleteness' && Array.isArray(cat.checks) && (
                            <div className="mt-3 grid grid-cols-1 gap-1.5">
                              {cat.checks.map((c) => (
                                <div key={c.key} className="flex items-center gap-2 text-xs">
                                  {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                                  <span className={c.ok ? 'text-slate-600' : 'text-slate-400'}>{c.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Trend */}
                {trend.length >= 2 && (
                  <Card className="border-slate-200">
                    <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-emerald-600" /> Score over time</CardTitle></CardHeader>
                    <CardContent>
                      <Sparkline data={trend} />
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                <Card className="border-slate-200">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-violet-600" /> Optimization plan <span className="text-sm font-normal text-slate-400">({audit.recommendations?.length || 0} actions)</span></CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(audit.recommendations || []).map((r, idx) => {
                      const open = !!openRec[r.id]
                      return (
                        <div key={r.id} className="rounded-xl border border-slate-200">
                          <button onClick={() => setOpenRec((o) => ({ ...o, [r.id]: !o[r.id] }))} className="flex w-full items-start gap-3 p-3 text-left">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{idx + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <Badge className={`border-0 text-[10px] ${impactTint(r.impact)}`}>{r.impact} impact</Badge>
                                <Badge className={`border-0 text-[10px] ${effortTint(r.effort)}`}>{r.effort} effort</Badge>
                                <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                              </div>
                            </div>
                            {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                          </button>
                          {open && (
                            <div className="space-y-2 border-t border-slate-100 px-3 py-3 pl-12 text-sm">
                              {r.why && <p className="text-slate-600"><span className="font-medium text-slate-800">Why: </span>{r.why}</p>}
                              {r.howTo && <p className="text-slate-600"><span className="font-medium text-slate-800">How: </span>{r.howTo}</p>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>

                {/* Optimized content */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Type className="h-4 w-4 text-indigo-600" /> AI-optimized description</CardTitle></CardHeader>
                    <CardContent>
                      <div className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{audit.optimizedDescription || '—'}</div>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => copy(audit.optimizedDescription, 'Description copied')}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy description</Button>
                    </CardContent>
                  </Card>
                  <div className="space-y-4">
                    <Card className="border-slate-200">
                      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-emerald-600" /> Suggested categories</CardTitle></CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {(audit.suggestedCategories || []).map((c, i) => (
                          <Badge key={c} className={`border-0 ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{i === 0 ? '★ ' : ''}{c}</Badge>
                        ))}
                        {(!audit.suggestedCategories || audit.suggestedCategories.length === 0) && <span className="text-sm text-slate-400">—</span>}
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="flex items-center gap-2 text-base"><Tag className="h-4 w-4 text-violet-600" /> Target keywords</CardTitle>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copy((audit.suggestedKeywords || []).join(', '), 'Keywords copied')}><Copy className="mr-1 h-3 w-3" /> Copy all</Button>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {(audit.suggestedKeywords || []).map((k) => (
                          <span key={k} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{k}</span>
                        ))}
                        {(!audit.suggestedKeywords || audit.suggestedKeywords.length === 0) && <span className="text-sm text-slate-400">—</span>}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        niuronai — Manage, optimize and grow your Google Business Profile with AI.
      </footer>
    </div>
  )
}
