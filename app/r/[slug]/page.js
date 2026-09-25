'use client'

import { useEffect, useRef, useState } from 'react'
import { use as usePromise } from 'react'
import { toast } from 'sonner'
import { Sparkles, Check, Copy, RefreshCw, Pencil, ExternalLink, Star, Loader2, ArrowRight } from 'lucide-react'

function uuid() {
  return (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2))
}

export default function ReviewPage({ params }) {
  const { slug } = usePromise(params)

  const [campaign, setCampaign] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [selected, setSelected] = useState([])
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState([])
  const [generating, setGenerating] = useState(false)
  const [regenIndex, setRegenIndex] = useState(-1)
  const [copiedIndex, setCopiedIndex] = useState(-1)
  const sessionId = useRef(uuid())
  const draftsRef = useRef(null)

  const primary = campaign?.primaryColor || '#6d28d9'
  const secondary = campaign?.secondaryColor || primary

  const track = (type, meta = {}) => {
    fetch(`/api/public/${slug}/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, sessionId: sessionId.current, meta }),
    }).catch(() => {})
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/${slug}`)
        if (!res.ok) { setNotFound(true); return }
        const data = await res.json()
        setCampaign(data)
        track('landing_view')
      } catch (e) { setNotFound(true) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const toggle = (label) => {
    setSelected((prev) => {
      const has = prev.includes(label)
      if (has) return prev.filter((l) => l !== label)
      if (prev.length === 0) track('experience_selected')
      if (campaign?.allowMultiSelect === false) return [label]
      return [...prev, label]
    })
  }

  const generate = async () => {
    if (selected.length === 0 && !text.trim()) {
      toast.error('Tap at least one option or add a note first')
      return
    }
    setGenerating(true)
    setDrafts([])
    try {
      const res = await fetch(`/api/public/${slug}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiences: selected, text, sessionId: sessionId.current }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.detail ? `${data.error || 'Generation failed'}: ${data.detail}` : (data.error || 'Generation failed')
        throw new Error(msg)
      }
      setDrafts(data.drafts.map((d) => ({ ...d, editing: false })))
      setTimeout(() => draftsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      toast.error(e.message || 'AI could not generate right now. Please try again.')
    } finally { setGenerating(false) }
  }

  const regenerate = async (i) => {
    setRegenIndex(i)
    try {
      const res = await fetch(`/api/public/${slug}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiences: selected, text, sessionId: sessionId.current }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.detail ? `${data.error || 'Failed'}: ${data.detail}` : (data.error || 'Failed')
        throw new Error(msg)
      }
      const curText = drafts[i]?.text
      const freshDraft = (data.drafts || []).find((d, idx) => idx === i && d.text !== curText) ||
                         (data.drafts || []).find((d) => d.text !== curText) ||
                         (data.drafts || [])[i % (data.drafts?.length || 1)] ||
                         (data.drafts || [])[0]
      if (freshDraft) {
        setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, text: freshDraft.text } : d)))
      }
      toast.success('Regenerated')
    } catch (e) { toast.error(e.message) } finally { setRegenIndex(-1) }
  }

  const copyText = (str) => {
    // Try async clipboard API, fall back to execCommand. Never blocks the user gesture.
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).catch(() => {})
      }
    } catch (e) { /* ignore */ }
    try {
      const ta = document.createElement('textarea')
      ta.value = str
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch (e) { /* ignore */ }
  }

  // IMPORTANT: window.open must run synchronously inside the click handler,
  // otherwise the browser popup blocker cancels the Google redirect.
  const copyAndGo = (i) => {
    const draft = drafts[i]
    const url = campaign?.googleReviewUrl

    track('draft_selected', { index: i })
    track('copy_clicked', { index: i })

    // 1) Copy (fire-and-forget so we stay within the user gesture)
    copyText(draft.text)
    setCopiedIndex(i)
    track('copy_success', { index: i })
    toast.success('Review copied ✓ — opening Google')

    // 2) Redirect to the real Google review destination — synchronously
    track('google_redirect_clicked', { index: i })
    if (url) {
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      // Fallback: if the popup was blocked, navigate the current tab instead
      if (!win || win.closed || typeof win.closed === 'undefined') {
        window.location.href = url
      }
    } else {
      toast.message('Google review link is not configured for this campaign yet')
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-500"><Star className="h-7 w-7" /></div>
          <h1 className="text-lg font-semibold text-slate-900">Campaign not found</h1>
          <p className="mt-1 text-sm text-slate-500">This review link may be paused or no longer available.</p>
        </div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ ['--brand']: primary }}>
      {/* Brand header */}
      <div className="px-4 pt-8 pb-6 text-center text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
        <div className="mx-auto max-w-md">
          {campaign.logoUrl ? (
            <img src={campaign.logoUrl} alt="" className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-white object-contain p-1" />
          ) : (
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold">
              {campaign.businessName?.[0] || 'N'}
            </div>
          )}
          <h1 className="text-xl font-bold leading-tight">{campaign.businessName}</h1>
          {campaign.city && <p className="mt-0.5 text-sm text-white/80">{campaign.city}</p>}
          <div className="mt-3 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => <Star key={n} className="h-6 w-6 fill-yellow-300 text-yellow-300" />)}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pb-16">
        {/* Prompt */}
        <div className="-mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-center text-lg font-bold text-slate-900">{campaign.headline || 'How was your experience?'}</h2>
          <p className="mt-1 text-center text-sm text-slate-500">{campaign.subheadline || 'Tap what you loved below.'}</p>

          {/* Experience buttons */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {(campaign.experienceButtons || []).map((b) => {
              const active = selected.includes(b.label)
              return (
                <button
                  key={b.id}
                  onClick={() => toggle(b.label)}
                  className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95"
                  style={active
                    ? { background: primary, borderColor: primary, color: '#fff' }
                    : { background: '#fff', borderColor: '#e2e8f0', color: '#334155' }}
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                  {b.label}
                </button>
              )
            })}
          </div>

          {/* Optional text */}
          {campaign.textFieldEnabled !== false && (
            <div className="mt-5">
              <label className="text-sm font-medium text-slate-700">Anything else you&apos;d like to mention? <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea
                value={text}
                onChange={(e) => { if (!text && e.target.value) track('text_field_used'); setText(e.target.value.slice(0, campaign.maxTextLength || 500)) }}
                rows={3}
                placeholder="Tell us a little more about your experience..."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400"
              />
              <p className="mt-1 text-right text-[11px] text-slate-400">{text.length}/{campaign.maxTextLength || 500}</p>
            </div>
          )}

          <button
            onClick={generate}
            disabled={generating}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: primary, boxShadow: `0 10px 20px -8px ${primary}` }}
          >
            {generating ? <><Loader2 className="h-5 w-5 animate-spin" /> Writing your review...</> : <><Sparkles className="h-5 w-5" /> Generate My Review</>}
          </button>
        </div>

        {/* Drafts */}
        {(generating || drafts.length > 0) && (
          <div ref={draftsRef} className="mt-6 space-y-4">
            <p className="text-center text-sm font-medium text-slate-500">Pick the one that fits you best — you can edit it</p>

            {generating && drafts.length === 0 && [1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-white shadow-sm" />
            ))}

            {drafts.map((d, i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center gap-2 px-4 pt-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: primary }}>{i + 1}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.style}</span>
                </div>
                <div className="px-4 py-3">
                  {d.editing ? (
                    <textarea
                      value={d.text}
                      onChange={(e) => setDrafts((prev) => prev.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))}
                      rows={4}
                      className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                    />
                  ) : (
                    <p className="text-[15px] leading-relaxed text-slate-800">{d.text}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                  <button onClick={() => setDrafts((prev) => prev.map((x, idx) => idx === i ? { ...x, editing: !x.editing } : x))} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    <Pencil className="h-3.5 w-3.5" /> {d.editing ? 'Done' : 'Edit'}
                  </button>
                  <button onClick={() => regenerate(i)} disabled={regenIndex === i} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    <RefreshCw className={`h-3.5 w-3.5 ${regenIndex === i ? 'animate-spin' : ''}`} /> Regenerate
                  </button>
                  <button onClick={() => copyAndGo(i)} className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition active:scale-95" style={{ background: copiedIndex === i ? '#16a34a' : primary }}>
                    {copiedIndex === i ? <><Check className="h-3.5 w-3.5" /> Copied — opening Google</> : <><Copy className="h-3.5 w-3.5" /> Copy &amp; Paste to Google</>}
                  </button>
                </div>
              </div>
            ))}

            {drafts.length > 0 && (
              <div className="rounded-2xl bg-blue-50 p-4 text-center text-xs text-blue-700">
                Your review has been copied. Google will open next. Please review the text and edit it so it accurately reflects your genuine experience before posting.
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-slate-400">
          Powered by <span className="font-semibold text-slate-500">niuronai</span> · Post only what reflects your real experience
        </p>
      </div>
    </div>
  )
}
