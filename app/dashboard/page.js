'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sparkles, Plus, QrCode, BarChart3, ExternalLink, Copy, Trash2, MapPin,
  Download, Zap, MessageSquareQuote, Rocket, Link2, Pencil, ArrowUp, ArrowDown, X,
  Store,
} from 'lucide-react'

const empty = {
  businessName: '', category: '', city: '', services: '', description: '',
  headline: '', subheadline: '', googleReviewUrl: '', primaryColor: '#6d28d9',
}

export default function App() {
  const { user, loading: authLoading } = useRequireAuth()
  const [campaigns, setCampaigns] = useState([])
  const [gbpLocations, setGbpLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const [qrCampaign, setQrCampaign] = useState(null)
  const [qrConfig, setQrConfig] = useState(null)
  const [posterUrl, setPosterUrl] = useState('')
  const [posterBusy, setPosterBusy] = useState(false)
  const [analyticsCampaign, setAnalyticsCampaign] = useState(null)
  const [analytics, setAnalytics] = useState(null)

  // editor state
  const [editForm, setEditForm] = useState(null)
  const [editing, setEditing] = useState(false)
  const [newBtn, setNewBtn] = useState('')

  const uid = () => (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2))

  const openEditor = (c) => {
    setEditForm({
      ...c,
      services: Array.isArray(c.services) ? c.services.join(', ') : (c.services || ''),
      secondaryColor: c.secondaryColor || c.primaryColor,
      experienceButtons: (c.experienceButtons || []).map((b) => ({ ...b })),
      allowMultiSelect: c.allowMultiSelect !== false,
      textFieldEnabled: c.textFieldEnabled !== false,
      maxTextLength: c.maxTextLength || 500,
      draftCount: c.draftCount || 3,
      automation: {
        enabled: c.automation?.enabled || false,
        autoPublishMinRating: c.automation?.autoPublishMinRating || 5,
        tone: c.automation?.tone || 'Friendly',
        length: c.automation?.length || 'standard',
      },
    })
  }

  const setEF = (patch) => setEditForm((f) => ({ ...f, ...patch }))
  const setAuto = (patch) => setEditForm((f) => ({ ...f, automation: { ...f.automation, ...patch } }))

  const updateBtn = (id, patch) => setEditForm((f) => ({
    ...f, experienceButtons: f.experienceButtons.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  }))
  const removeBtn = (id) => setEditForm((f) => ({ ...f, experienceButtons: f.experienceButtons.filter((b) => b.id !== id) }))
  const moveBtn = (idx, dir) => setEditForm((f) => {
    const arr = [...f.experienceButtons]
    const j = idx + dir
    if (j < 0 || j >= arr.length) return f
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    return { ...f, experienceButtons: arr }
  })
  const addBtn = () => {
    const label = newBtn.trim()
    if (!label) return
    setEditForm((f) => ({ ...f, experienceButtons: [...f.experienceButtons, { id: uid(), label, enabled: true }] }))
    setNewBtn('')
  }

  const saveEditor = async () => {
    if (!editForm.businessName?.trim()) { toast.error('Business name is required'); return }
    if (!editForm.experienceButtons.some((b) => b.enabled)) { toast.error('Keep at least one experience button enabled'); return }
    setEditing(true)
    try {
      const payload = { ...editForm }
      delete payload.stats
      const res = await fetch(`/api/campaigns/${editForm.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success('Campaign updated')
      setEditForm(null)
      load()
    } catch (e) { toast.error(e.message) } finally { setEditing(false) }
  }


  useEffect(() => { setOrigin(window.location.origin) }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
    fetch('/api/gbp/status').then((r) => r.json()).then((d) => {
      if (Array.isArray(d?.locations)) setGbpLocations(d.locations)
    }).catch(() => {})
  }
  useEffect(() => { if (user) load() }, [user])

  // live poster preview
  useEffect(() => {
    let cancelled = false
    if (!qrConfig || !qrCampaign || !origin) return
    ;(async () => {
      try {
        const c = await safeCanvas(qrConfig)
        if (!cancelled) setPosterUrl(c.toDataURL('image/png'))
      } catch (e) { /* ignore */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrConfig, qrCampaign, origin])

  const publicUrl = (slug) => `${origin}/r/${slug}`

  const totals = useMemo(() => {
    return campaigns.reduce((acc, c) => {
      const s = c.stats || {}
      acc.views += s.landing_view || 0
      acc.drafts += s.draft_generated || 0
      acc.copies += s.copy_success || 0
      acc.redirects += s.google_redirect_clicked || 0
      return acc
    }, { views: 0, drafts: 0, copies: 0, redirects: 0 })
  }, [campaigns])

  const createCampaign = async () => {
    if (!form.businessName.trim()) { toast.error('Business name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success('Campaign created')
      setCreateOpen(false); setForm(empty)
      load()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const removeCampaign = async (id) => {
    if (!confirm('Delete this campaign and its analytics?')) return
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
    toast.success('Campaign deleted')
    load()
  }

  const seed = async () => {
    const res = await fetch('/api/seed', { method: 'POST' })
    const data = await res.json()
    if (res.ok) { toast.success(`Loaded ${data.created} demo campaigns`); load() }
    else toast.error('Seed failed')
  }

  const copyLink = (slug) => {
    navigator.clipboard.writeText(publicUrl(slug))
    toast.success('Public link copied')
  }

  const openQr = (c) => {
    setQrCampaign(c)
    setPosterUrl('')
    setQrConfig({
      headline: c.headline || 'Loved your visit?',
      subheadline: 'Scan the code to leave us a quick review',
      cta: 'Open your camera & scan',
      frame: 'card',
      fg: c.primaryColor || '#6d28d9',
      bg2: c.secondaryColor || c.primaryColor || '#4f46e5',
      posterBg: '#ffffff',
      showLogo: !!c.logoUrl,
      logoUrl: c.logoUrl || '',
      ecc: 'H',
    })
  }
  const setQC = (patch) => setQrConfig((f) => ({ ...f, ...patch }))

  const loadImg = (src) => new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  const wrapText = (ctx, text, maxWidth) => {
    const words = String(text).split(' ')
    const lines = []
    let line = ''
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w }
      else line = test
    }
    if (line) lines.push(line)
    return lines
  }

  // Compose a print-ready poster on a canvas. Returns the canvas element.
  const renderPosterCanvas = async (cfg, includeLogo = true) => {
    const url = publicUrl(qrCampaign.slug)
    const W = 1080, H = 1350
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')

    // background
    ctx.fillStyle = cfg.posterBg || '#ffffff'
    ctx.fillRect(0, 0, W, H)

    const minimal = cfg.frame === 'minimal'

    // header band
    if (!minimal) {
      const grad = ctx.createLinearGradient(0, 0, W, 320)
      grad.addColorStop(0, cfg.fg)
      grad.addColorStop(1, cfg.bg2 || cfg.fg)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, 320)
    }
    // headline
    ctx.textAlign = 'center'
    ctx.fillStyle = minimal ? '#0f172a' : '#ffffff'
    ctx.font = '700 60px Inter, Arial, sans-serif'
    const hl = wrapText(ctx, cfg.headline || '', 900)
    let hy = (minimal ? 120 : 140) - (hl.length - 1) * 34
    hl.forEach((ln) => { ctx.fillText(ln, W / 2, hy); hy += 72 })
    // subheadline
    ctx.font = '400 30px Inter, Arial, sans-serif'
    ctx.fillStyle = minimal ? '#64748b' : 'rgba(255,255,255,0.9)'
    ctx.fillText(cfg.subheadline || '', W / 2, (minimal ? 175 : 235))

    // QR card
    const cardX = 180, cardY = 380, cardS = 720
    if (cfg.frame !== 'minimal') {
      ctx.save()
      ctx.shadowColor = 'rgba(15,23,42,0.12)'
      ctx.shadowBlur = 40; ctx.shadowOffsetY = 16
      ctx.fillStyle = '#ffffff'
      roundRect(ctx, cardX, cardY, cardS, cardS, 40)
      ctx.fill()
      ctx.restore()
      ctx.lineWidth = 2; ctx.strokeStyle = '#eef2f7'
      roundRect(ctx, cardX, cardY, cardS, cardS, 40); ctx.stroke()
    }

    // QR image
    const qrPng = await QRCode.toDataURL(url, {
      width: 620, margin: 1, errorCorrectionLevel: cfg.ecc || 'H',
      color: { dark: cfg.fg, light: '#ffffff' },
    })
    const qrImg = await loadImg(qrPng)
    const qrSize = 600, qx = W / 2 - qrSize / 2, qy = cardY + 60
    ctx.drawImage(qrImg, qx, qy, qrSize, qrSize)

    // center logo
    if (includeLogo && cfg.showLogo && cfg.logoUrl) {
      try {
        const logo = await loadImg(cfg.logoUrl)
        const boxS = 130, cx = W / 2, cy = qy + qrSize / 2
        ctx.fillStyle = '#ffffff'
        roundRect(ctx, cx - boxS / 2, cy - boxS / 2, boxS, boxS, 22); ctx.fill()
        const inner = 96
        ctx.save(); roundRect(ctx, cx - inner / 2, cy - inner / 2, inner, inner, 16); ctx.clip()
        ctx.drawImage(logo, cx - inner / 2, cy - inner / 2, inner, inner)
        ctx.restore()
      } catch (e) { /* logo failed, ignore */ }
    }

    // CTA pill
    ctx.font = '600 34px Inter, Arial, sans-serif'
    const ctaW = ctx.measureText(cfg.cta || '').width + 90
    const pillX = W / 2 - ctaW / 2, pillY = 1150, pillH = 76
    ctx.fillStyle = cfg.fg
    roundRect(ctx, pillX, pillY, ctaW, pillH, 38); ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(cfg.cta || '', W / 2, pillY + 50)

    // business name + city
    ctx.fillStyle = '#0f172a'
    ctx.font = '700 40px Inter, Arial, sans-serif'
    ctx.fillText(qrCampaign.businessName || '', W / 2, 1290)
    if (qrCampaign.city) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '400 26px Inter, Arial, sans-serif'
      ctx.fillText(qrCampaign.city, W / 2, 1326)
    }
    return canvas
  }

  const safeCanvas = async (cfg) => {
    try {
      const c = await renderPosterCanvas(cfg, true)
      c.toDataURL('image/png') // triggers SecurityError if tainted by CORS logo
      return c
    } catch (e) {
      return renderPosterCanvas(cfg, false)
    }
  }

  const download = (href, name) => {
    const a = document.createElement('a'); a.href = href; a.download = name; a.click()
  }

  const dlPng = async () => { setPosterBusy(true); try { const c = await safeCanvas(qrConfig); download(c.toDataURL('image/png'), `${qrCampaign.slug}-poster.png`) } finally { setPosterBusy(false) } }
  const dlJpg = async () => { setPosterBusy(true); try { const c = await safeCanvas(qrConfig); download(c.toDataURL('image/jpeg', 0.92), `${qrCampaign.slug}-poster.jpg`) } finally { setPosterBusy(false) } }
  const dlPdf = async () => {
    setPosterBusy(true)
    try {
      const c = await safeCanvas(qrConfig)
      const png = c.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [c.width, c.height] })
      pdf.addImage(png, 'PNG', 0, 0, c.width, c.height)
      pdf.save(`${qrCampaign.slug}-poster.pdf`)
    } finally { setPosterBusy(false) }
  }
  const dlSvg = async () => {
    setPosterBusy(true)
    try {
      const cfg = qrConfig
      const url = publicUrl(qrCampaign.slug)
      const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: cfg.ecc || 'H', color: { dark: cfg.fg, light: '#ffffff' } })
      const vb = (qrSvg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 25 25'
      const inner = qrSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const minimal = cfg.frame === 'minimal'
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="Inter, Arial, sans-serif">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="${cfg.fg}"/><stop offset="1" stop-color="${cfg.bg2 || cfg.fg}"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="${cfg.posterBg || '#ffffff'}"/>
  ${minimal ? '' : '<rect width="1080" height="320" fill="url(#g)"/>'}
  <text x="540" y="150" text-anchor="middle" fill="${minimal ? '#0f172a' : '#ffffff'}" font-size="58" font-weight="700">${esc(cfg.headline)}</text>
  <text x="540" y="220" text-anchor="middle" fill="${minimal ? '#64748b' : 'rgba(255,255,255,0.9)'}" font-size="30">${esc(cfg.subheadline)}</text>
  ${minimal ? '' : '<rect x="180" y="380" width="720" height="720" rx="40" fill="#ffffff" stroke="#eef2f7" stroke-width="2"/>'}
  <svg x="240" y="440" width="600" height="600" viewBox="${vb}">${inner}</svg>
  <rect x="330" y="1150" width="420" height="76" rx="38" fill="${cfg.fg}"/>
  <text x="540" y="1200" text-anchor="middle" fill="#ffffff" font-size="34" font-weight="600">${esc(cfg.cta)}</text>
  <text x="540" y="1290" text-anchor="middle" fill="#0f172a" font-size="40" font-weight="700">${esc(qrCampaign.businessName)}</text>
  <text x="540" y="1326" text-anchor="middle" fill="#94a3b8" font-size="26">${esc(qrCampaign.city || '')}</text>
</svg>`
      download(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), `${qrCampaign.slug}-poster.svg`)
    } finally { setPosterBusy(false) }
  }

  const openAnalytics = async (c) => {
    setAnalyticsCampaign(c); setAnalytics(null)
    const res = await fetch(`/api/campaigns/${c.id}/analytics`)
    setAnalytics(await res.json())
  }

  if (authLoading || !user) return <AuthGate />

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader active="campaigns">
        <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700">
          <Plus className="mr-1 h-4 w-4" /> New Campaign
        </Button>
      </AppHeader>

      <main className="container py-8">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-8 text-white shadow-xl md:p-12">
          <div className="relative z-10 max-w-2xl">
            <Badge className="mb-4 border-0 bg-white/15 text-white hover:bg-white/25">AI Review Campaigns</Badge>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">Turn happy customers into authentic Google reviews with AI</h1>
            <p className="mt-3 text-white/85">Create a QR-powered review page. Customers tap what they loved, AI drafts a natural review, they copy &amp; post to Google. No typing, no friction.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => setCreateOpen(true)} size="lg" className="bg-white text-violet-700 hover:bg-white/90">
                <Rocket className="mr-2 h-4 w-4" /> Create your first campaign
              </Button>
              {campaigns.length === 0 && (
                <Button onClick={seed} size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
                  <Zap className="mr-2 h-4 w-4" /> Load demo data
                </Button>
              )}
            </div>
          </div>
          <Sparkles className="pointer-events-none absolute -right-6 -top-6 h-48 w-48 text-white/10" />
          <MessageSquareQuote className="pointer-events-none absolute bottom-4 right-10 h-28 w-28 text-white/10" />
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Landing Views', value: totals.views, icon: BarChart3, tint: 'text-blue-600 bg-blue-50' },
            { label: 'Drafts Generated', value: totals.drafts, icon: Sparkles, tint: 'text-violet-600 bg-violet-50' },
            { label: 'Copies', value: totals.copies, icon: Copy, tint: 'text-emerald-600 bg-emerald-50' },
            { label: 'Google Redirects', value: totals.redirects, icon: ExternalLink, tint: 'text-amber-600 bg-amber-50' },
          ].map((s) => (
            <Card key={s.label} className="border-slate-200">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.tint}`}><s.icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{s.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Campaigns */}
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Your Campaigns</h2>
          <span className="text-sm text-slate-500">{campaigns.length} total</span>
        </div>

        {loading ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Card key={i} className="h-56 animate-pulse bg-slate-100" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="mt-4 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><QrCode className="h-7 w-7" /></div>
              <h3 className="text-lg font-semibold text-slate-900">No campaigns yet</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Create your first review campaign, or load demo data to explore the full workflow.</p>
              <div className="mt-5 flex gap-3">
                <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-1 h-4 w-4" /> New Campaign</Button>
                <Button onClick={seed} variant="outline"><Zap className="mr-1 h-4 w-4" /> Load demo data</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => {
              const s = c.stats || {}
              return (
                <Card key={c.id} className="group overflow-hidden border-slate-200 transition hover:shadow-lg">
                  <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${c.primaryColor}, ${c.secondaryColor || c.primaryColor})` }} />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base leading-tight">{c.businessName}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-1 text-xs">
                          <MapPin className="h-3 w-3" /> {c.city || c.category || 'No location set'}
                        </CardDescription>
                      </div>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className={c.status === 'active' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>{c.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-50 p-2 text-center">
                      {[['Views', s.landing_view], ['Drafts', s.draft_generated], ['Copies', s.copy_success], ['Google', s.google_redirect_clicked]].map(([l, v]) => (
                        <div key={l}><p className="text-sm font-bold text-slate-900">{v || 0}</p><p className="text-[10px] text-slate-500">{l}</p></div>
                      ))}
                    </div>
                    <button onClick={() => copyLink(c.slug)} className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-violet-300 hover:bg-violet-50">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                      <span className="truncate">/r/{c.slug}</span>
                      <Copy className="ml-auto h-3.5 w-3.5 shrink-0" />
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => window.open(publicUrl(c.slug), '_blank')} className="flex-1"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Open</Button>
                      <Button size="sm" variant="outline" onClick={() => openEditor(c)} className="flex-1"><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => openQr(c)} className="flex-1"><QrCode className="mr-1 h-3.5 w-3.5" /> QR</Button>
                      <Button size="sm" variant="outline" onClick={() => openAnalytics(c)} className="flex-1"><BarChart3 className="mr-1 h-3.5 w-3.5" /> Stats</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeCampaign(c.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Review Campaign</DialogTitle>
            <DialogDescription>The AI uses this business context to draft authentic reviews. No fabricated details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {gbpLocations.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3 space-y-1.5">
                <Label className="text-xs font-semibold text-violet-900 flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-violet-600" /> Auto-fill from Connected Google Location
                </Label>
                <Select onValueChange={(val) => {
                  const loc = gbpLocations.find((l) => l.resourceName === val)
                  if (!loc) return
                  setForm((f) => ({
                    ...f,
                    businessName: loc.title || f.businessName,
                    city: loc.address ? loc.address.split(',').slice(-2, -1)[0]?.trim() || loc.address : f.city,
                    googleReviewUrl: loc.mapsUri || f.googleReviewUrl,
                  }))
                  toast.success(`Imported ${loc.title || 'location details'}`)
                }}>
                  <SelectTrigger className="bg-white text-xs h-9">
                    <SelectValue placeholder="Choose a linked Google location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {gbpLocations.map((l) => (
                      <SelectItem key={l.resourceName} value={l.resourceName} className="text-xs">
                        {l.title || l.resourceName} {l.address ? `(${l.address})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Business name *</Label>
              <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="e.g. Aroma Bistro & Cafe" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Cafe & Restaurant" /></div>
              <div className="space-y-1.5"><Label>City / Location</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Bengaluru" /></div>
            </div>
            <div className="space-y-1.5"><Label>Services (comma separated)</Label><Input value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} placeholder="Specialty Coffee, Breakfast, Desserts" /></div>
            <div className="space-y-1.5"><Label>Business description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A cosy neighbourhood cafe known for specialty coffee..." rows={2} /></div>
            <div className="space-y-1.5">
              <Label>Google review link</Label>
              <Input value={form.googleReviewUrl} onChange={(e) => setForm({ ...form, googleReviewUrl: e.target.value })} placeholder="https://search.google.com/local/writereview?placeid=..." />
              <p className="text-[11px] text-slate-500">Where customers land to post. Leave blank to add later.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Headline</Label><Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="How was your experience?" /></div>
              <div className="space-y-1.5"><Label>Brand color</Label><div className="flex items-center gap-2"><Input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="h-10 w-14 p-1" /><Input value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} /></div></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createCampaign} disabled={saving} className="bg-violet-600 hover:bg-violet-700">{saving ? 'Creating...' : 'Create Campaign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor dialog */}
      <Dialog open={!!editForm} onOpenChange={(o) => !o && setEditForm(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>Customize branding, experience buttons and settings. Changes apply to the public review page instantly.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <Tabs defaultValue="branding" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="branding">Branding</TabsTrigger>
                <TabsTrigger value="buttons">Buttons</TabsTrigger>
                <TabsTrigger value="automation">Automation</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              {/* Branding */}
              <TabsContent value="branding" className="space-y-4 py-3">
                <div className="space-y-1.5"><Label>Business name *</Label><Input value={editForm.businessName} onChange={(e) => setEF({ businessName: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Category</Label><Input value={editForm.category || ''} onChange={(e) => setEF({ category: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>City / Location</Label><Input value={editForm.city || ''} onChange={(e) => setEF({ city: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Services (comma separated)</Label><Input value={editForm.services} onChange={(e) => setEF({ services: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Business description</Label><Textarea rows={2} value={editForm.description || ''} onChange={(e) => setEF({ description: e.target.value })} /></div>
                <Separator />
                <div className="space-y-1.5"><Label>Headline</Label><Input value={editForm.headline || ''} onChange={(e) => setEF({ headline: e.target.value })} placeholder="How was your experience?" /></div>
                <div className="space-y-1.5"><Label>Subheadline</Label><Input value={editForm.subheadline || ''} onChange={(e) => setEF({ subheadline: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Button label (CTA)</Label><Input value={editForm.ctaText || ''} onChange={(e) => setEF({ ctaText: e.target.value })} placeholder="Copy & Paste to Google" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Primary color</Label><div className="flex items-center gap-2"><Input type="color" value={editForm.primaryColor} onChange={(e) => setEF({ primaryColor: e.target.value })} className="h-10 w-14 p-1" /><Input value={editForm.primaryColor} onChange={(e) => setEF({ primaryColor: e.target.value })} /></div></div>
                  <div className="space-y-1.5"><Label>Secondary color</Label><div className="flex items-center gap-2"><Input type="color" value={editForm.secondaryColor} onChange={(e) => setEF({ secondaryColor: e.target.value })} className="h-10 w-14 p-1" /><Input value={editForm.secondaryColor} onChange={(e) => setEF({ secondaryColor: e.target.value })} /></div></div>
                </div>
                <div className="space-y-1.5"><Label>Logo URL</Label><Input value={editForm.logoUrl || ''} onChange={(e) => setEF({ logoUrl: e.target.value })} placeholder="https://..." /></div>
              </TabsContent>

              {/* Buttons */}
              <TabsContent value="buttons" className="space-y-4 py-3">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div><p className="text-sm font-medium text-slate-800">Allow multiple selections</p><p className="text-xs text-slate-500">Let customers pick more than one experience.</p></div>
                  <Switch checked={editForm.allowMultiSelect} onCheckedChange={(v) => setEF({ allowMultiSelect: v })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div><p className="text-sm font-medium text-slate-800">Optional text field</p><p className="text-xs text-slate-500">Show a free-text box under the buttons.</p></div>
                  <Switch checked={editForm.textFieldEnabled} onCheckedChange={(v) => setEF({ textFieldEnabled: v })} />
                </div>

                <div>
                  <Label className="mb-2 block">Experience buttons</Label>
                  <div className="space-y-2">
                    {editForm.experienceButtons.map((b, idx) => (
                      <div key={b.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                        <div className="flex flex-col">
                          <button onClick={() => moveBtn(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button onClick={() => moveBtn(idx, 1)} disabled={idx === editForm.experienceButtons.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                        <Input value={b.label} onChange={(e) => updateBtn(b.id, { label: e.target.value })} className="h-8 flex-1" />
                        <div className="flex items-center gap-1.5">
                          <Switch checked={b.enabled} onCheckedChange={(v) => updateBtn(b.id, { enabled: v })} />
                          <button onClick={() => removeBtn(b.id)} className="text-slate-300 hover:text-red-600"><X className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input value={newBtn} onChange={(e) => setNewBtn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBtn())} placeholder="Add a custom button, e.g. Great Ambience" className="h-9" />
                    <Button type="button" variant="outline" onClick={addBtn}><Plus className="mr-1 h-4 w-4" /> Add</Button>
                  </div>
                </div>
              </TabsContent>

              {/* Automation */}
              <TabsContent value="automation" className="space-y-4 py-3">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div><p className="text-sm font-medium text-slate-800">Enable automated replies</p><p className="text-xs text-slate-500">Auto-draft AI replies for new reviews.</p></div>
                  <Switch checked={editForm.automation.enabled} onCheckedChange={(v) => setAuto({ enabled: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Auto-publish reviews rated</Label>
                  <Select value={String(editForm.automation.autoPublishMinRating)} onValueChange={(v) => setAuto({ autoPublishMinRating: parseInt(v, 10) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Only 5 stars</SelectItem>
                      <SelectItem value="4">4 stars &amp; above</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500">Everything below this goes to the approval queue. Negative &amp; neutral reviews are never auto-published.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Reply tone</Label>
                    <Select value={editForm.automation.tone} onValueChange={(v) => setAuto({ tone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['Professional', 'Friendly', 'Warm', 'Premium', 'Minimal', 'Local', 'Empathetic'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reply length</Label>
                    <Select value={editForm.automation.length} onValueChange={(v) => setAuto({ length: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="short">Short</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="detailed">Detailed</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                  <span className="mt-0.5">🛡️</span>
                  <span>Safety: complaints and low-rated reviews always require your manual approval before publishing. You can review and edit every drafted reply in the Reviews inbox.</span>
                </div>
              </TabsContent>

              {/* Settings */}
              <TabsContent value="settings" className="space-y-4 py-3">
                <div className="space-y-1.5">
                  <Label>Google review link</Label>
                  <Input value={editForm.googleReviewUrl || ''} onChange={(e) => setEF({ googleReviewUrl: e.target.value })} placeholder="https://search.google.com/local/writereview?placeid=..." />
                  <p className="text-[11px] text-slate-500">Where customers are sent to post their review on Google.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEF({ status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max note length</Label>
                    <Input type="number" value={editForm.maxTextLength} onChange={(e) => setEF({ maxTextLength: parseInt(e.target.value || '0', 10) })} />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                  Public link: <span className="font-mono text-slate-700">/r/{editForm.slug}</span>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)}>Cancel</Button>
            <Button onClick={saveEditor} disabled={editing} className="bg-violet-600 hover:bg-violet-700">{editing ? 'Saving...' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Poster Designer */}
      <Dialog open={!!qrCampaign} onOpenChange={(o) => !o && (setQrCampaign(null), setQrConfig(null))}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>QR Poster Designer</DialogTitle>
            <DialogDescription>Design a branded, print-ready review poster for {qrCampaign?.businessName}.</DialogDescription>
          </DialogHeader>
          {qrConfig && (
            <div className="grid gap-6 py-2 md:grid-cols-2">
              {/* Preview */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-full max-w-[300px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                  {posterUrl
                    ? <img src={posterUrl} alt="Poster preview" className="w-full" />
                    : <div className="aspect-[1080/1350] w-full animate-pulse bg-slate-100" />}
                </div>
                <p className="break-all rounded-md bg-slate-50 px-3 py-1.5 text-center text-[11px] text-slate-400">{publicUrl(qrCampaign.slug)}</p>
                <div className="grid w-full max-w-[300px] grid-cols-4 gap-2">
                  <Button size="sm" onClick={dlPng} disabled={posterBusy} className="bg-violet-600 hover:bg-violet-700"><Download className="h-3.5 w-3.5" /> PNG</Button>
                  <Button size="sm" variant="outline" onClick={dlJpg} disabled={posterBusy}>JPG</Button>
                  <Button size="sm" variant="outline" onClick={dlPdf} disabled={posterBusy}>PDF</Button>
                  <Button size="sm" variant="outline" onClick={dlSvg} disabled={posterBusy}>SVG</Button>
                </div>
              </div>

              {/* Controls */}
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Headline</Label><Input value={qrConfig.headline} onChange={(e) => setQC({ headline: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Subheadline</Label><Input value={qrConfig.subheadline} onChange={(e) => setQC({ subheadline: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Call to action</Label><Input value={qrConfig.cta} onChange={(e) => setQC({ cta: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Frame style</Label>
                    <Select value={qrConfig.frame} onValueChange={(v) => setQC({ frame: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="card">Branded card</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Error correction</Label>
                    <Select value={qrConfig.ecc} onValueChange={(v) => setQC({ ecc: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L">Low</SelectItem>
                        <SelectItem value="M">Medium</SelectItem>
                        <SelectItem value="Q">Quartile</SelectItem>
                        <SelectItem value="H">High (logo safe)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">QR / Brand</Label><div className="flex items-center gap-1.5"><Input type="color" value={qrConfig.fg} onChange={(e) => setQC({ fg: e.target.value })} className="h-9 w-10 p-1" /></div></div>
                  <div className="space-y-1.5"><Label className="text-xs">Accent</Label><div className="flex items-center gap-1.5"><Input type="color" value={qrConfig.bg2} onChange={(e) => setQC({ bg2: e.target.value })} className="h-9 w-10 p-1" /></div></div>
                  <div className="space-y-1.5"><Label className="text-xs">Poster bg</Label><div className="flex items-center gap-1.5"><Input type="color" value={qrConfig.posterBg} onChange={(e) => setQC({ posterBg: e.target.value })} className="h-9 w-10 p-1" /></div></div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div><p className="text-sm font-medium text-slate-800">Center logo</p><p className="text-xs text-slate-500">Place your logo in the middle of the QR.</p></div>
                  <Switch checked={qrConfig.showLogo} onCheckedChange={(v) => setQC({ showLogo: v })} />
                </div>
                {qrConfig.showLogo && (
                  <div className="space-y-1.5"><Label>Logo URL</Label><Input value={qrConfig.logoUrl} onChange={(e) => setQC({ logoUrl: e.target.value })} placeholder="https://..." /></div>
                )}
                <p className="text-[11px] text-slate-400">Tip: use High error correction when adding a center logo so the code still scans reliably.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Analytics dialog */}
      <Dialog open={!!analyticsCampaign} onOpenChange={(o) => !o && setAnalyticsCampaign(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Campaign Analytics</DialogTitle>
            <DialogDescription>{analyticsCampaign?.businessName}</DialogDescription>
          </DialogHeader>
          {!analytics ? (
            <div className="space-y-3 py-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div>
          ) : (
            <div className="space-y-4 py-2">
              {[
                { label: 'Landing Views', value: analytics.landing_view, color: 'bg-blue-500' },
                { label: 'Experience Selected', value: analytics.experience_selected, color: 'bg-indigo-500' },
                { label: 'Drafts Generated', value: analytics.draft_generated, color: 'bg-violet-500' },
                { label: 'Copies', value: analytics.copy_success, color: 'bg-emerald-500' },
                { label: 'Google Redirects', value: analytics.google_redirect_clicked, color: 'bg-amber-500' },
              ].map((row) => {
                const base = analytics.landing_view || 0
                const pct = base > 0 ? Math.round((row.value / base) * 100) : 0
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{row.label}</span><span className="font-semibold text-slate-900">{row.value}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
              <Separator />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-bold text-violet-600">{analytics.rates?.draftGenerationRate}%</p><p className="text-[10px] text-slate-500">Draft rate</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-bold text-emerald-600">{analytics.rates?.copyRate}%</p><p className="text-[10px] text-slate-500">Copy rate</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-bold text-amber-600">{analytics.rates?.googleRedirectRate}%</p><p className="text-[10px] text-slate-500">Google rate</p></div>
              </div>
              <p className="text-center text-[11px] text-slate-400">Interaction metrics only — not guaranteed review submissions.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        niuronai — Manage, optimize and grow your Google Business Profile with AI.
      </footer>
    </div>
  )
}
