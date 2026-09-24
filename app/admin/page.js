'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import AppHeader, { AuthGate } from '@/components/app/AppHeader'
import { useRequireAuth } from '@/lib/useSession'
import { LIMIT_KEYS, FEATURE_KEYS, LIMIT_LABELS, FEATURE_LABELS } from '@/lib/plans'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import {
  Users, IndianRupee, TrendingUp, Layers, Ticket, BarChart3, Plus, Copy, Trash2,
  Pencil, Loader2, Shield, Settings as SettingsIcon, Building2,
} from 'lucide-react'

const fmtINR = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')
const fetcher = (url) => fetch(url).then((r) => r.json())
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const api = async (url, method, body) => {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

/* ------------------------------- Overview ------------------------------- */
function Overview() {
  const { data: m } = useSWR('/api/admin/metrics', fetcher)
  if (!m) return <div className="py-10 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
  const cards = [
    { label: 'Total users', value: m.totalUsers, icon: Users, tint: 'text-violet-600 bg-violet-50' },
    { label: 'Paid users', value: m.paidUsers, icon: Shield, tint: 'text-emerald-600 bg-emerald-50' },
    { label: 'MRR', value: fmtINR(m.mrr), icon: IndianRupee, tint: 'text-blue-600 bg-blue-50' },
    { label: 'ARR', value: fmtINR(m.arr), icon: TrendingUp, tint: 'text-indigo-600 bg-indigo-50' },
    { label: 'Total revenue', value: fmtINR(m.revenue), icon: IndianRupee, tint: 'text-emerald-600 bg-emerald-50' },
    { label: 'Organizations', value: m.totalOrgs, icon: Building2, tint: 'text-slate-600 bg-slate-100' },
    { label: 'Campaigns', value: m.campaigns, icon: BarChart3, tint: 'text-fuchsia-600 bg-fuchsia-50' },
    { label: 'New users (7d)', value: m.newUsers7d, icon: Users, tint: 'text-amber-600 bg-amber-50' },
  ]
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.tint}`}><Icon className="h-5 w-5" /></span>
                <div><p className="text-xs text-slate-500">{c.label}</p><p className="text-xl font-bold text-slate-900">{c.value}</p></div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Plan distribution</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(m.planDistribution || {}).map(([name, count]) => (
            <div key={name} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{name}</span>
              <Badge variant="secondary">{count} {count === 1 ? 'org' : 'orgs'}</Badge>
            </div>
          ))}
          <Separator className="my-2" />
          <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Coupon redemptions</span><Badge variant="secondary">{m.couponRedemptions}</Badge></div>
        </CardContent>
      </Card>
    </div>
  )
}

/* -------------------------------- Users --------------------------------- */
function UsersTab() {
  const { data: users, mutate } = useSWR('/api/admin/users', fetcher)
  const { data: plans } = useSWR('/api/admin/plans', fetcher)
  const patch = async (id, body) => { try { await api(`/api/admin/users/${id}`, 'PATCH', body); toast.success('Updated'); mutate() } catch (e) { toast.error(e.message) } }
  if (!users) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead>User</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Role</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell><div className="font-medium text-slate-900">{u.name || '—'}</div><div className="text-xs text-slate-400">{u.email}</div></TableCell>
                <TableCell>
                  <Select value={(plans || []).find((p) => p.name === u.planName)?.id || ''} onValueChange={(v) => patch(u.id, { planId: v })}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder={u.planName} /></SelectTrigger>
                    <SelectContent>{(plans || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={u.status} onValueChange={(v) => patch(u.id, { status: v })}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={u.role} onValueChange={(v) => patch(u.id, { role: v })}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="owner">Owner</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="super_admin">Super admin</SelectItem></SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/* -------------------------------- Plans --------------------------------- */
const emptyPlan = () => ({
  name: '', description: '', prices: { INR: { monthly: 0, yearly: 0 } }, trialDays: 14,
  isActive: true, isPublic: true, sortOrder: 99,
  limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, 0])),
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])),
})

function PlanEditor({ plan, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    ...emptyPlan(), ...plan,
    prices: { INR: { monthly: plan?.prices?.INR?.monthly || 0, yearly: plan?.prices?.INR?.yearly || 0 } },
    limits: { ...emptyPlan().limits, ...(plan?.limits || {}) },
    features: { ...emptyPlan().features, ...(plan?.features || {}) },
  }))
  const [busy, setBusy] = useState(false)
  const isNew = !plan?.id
  const save = async () => {
    if (!f.name.trim()) { toast.error('Name is required'); return }
    setBusy(true)
    try {
      if (isNew) await api('/api/admin/plans', 'POST', f)
      else await api(`/api/admin/plans/${plan.id}`, 'PUT', f)
      toast.success(isNew ? 'Plan created' : 'Plan updated'); onSaved()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{isNew ? 'New plan' : `Edit ${plan.name}`}</DialogTitle><DialogDescription>Prices, limits & features are stored in the database — no code changes needed.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Monthly price (₹)</Label><Input type="number" value={f.prices.INR.monthly} onChange={(e) => setF({ ...f, prices: { INR: { ...f.prices.INR, monthly: Number(e.target.value) } } })} /></div>
            <div className="space-y-1.5"><Label>Yearly price (₹)</Label><Input type="number" value={f.prices.INR.yearly} onChange={(e) => setF({ ...f, prices: { INR: { ...f.prices.INR, yearly: Number(e.target.value) } } })} /></div>
            <div className="space-y-1.5"><Label>Trial days</Label><Input type="number" value={f.trialDays} onChange={(e) => setF({ ...f, trialDays: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Active</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.isPublic} onCheckedChange={(v) => setF({ ...f, isPublic: v })} /> Show on pricing</label>
          </div>
          <Separator />
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Limits <span className="font-normal text-slate-400">(-1 = unlimited)</span></p>
            <div className="grid grid-cols-2 gap-3">
              {LIMIT_KEYS.map((k) => (
                <div key={k} className="space-y-1"><Label className="text-xs">{LIMIT_LABELS[k] || k}</Label>
                  <Input type="number" value={f.limits[k]} onChange={(e) => setF({ ...f, limits: { ...f.limits, [k]: Number(e.target.value) } })} /></div>
              ))}
            </div>
          </div>
          <Separator />
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Features</p>
            <div className="grid grid-cols-2 gap-2">
              {FEATURE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs">
                  <Switch checked={!!f.features[k]} onCheckedChange={(v) => setF({ ...f, features: { ...f.features, [k]: v } })} /> {FEATURE_LABELS[k] || k}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-violet-600 hover:bg-violet-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save plan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlansTab() {
  const { data: plans, mutate } = useSWR('/api/admin/plans', fetcher)
  const [editing, setEditing] = useState(null)
  const duplicate = async (id) => { try { await api(`/api/admin/plans/${id}/duplicate`, 'POST'); toast.success('Duplicated'); mutate() } catch (e) { toast.error(e.message) } }
  const remove = async (id) => { try { await api(`/api/admin/plans/${id}`, 'DELETE'); toast.success('Deactivated'); mutate() } catch (e) { toast.error(e.message) } }
  if (!plans) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing({})} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-1 h-4 w-4" /> New plan</Button></div>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className={!p.isActive ? 'opacity-60' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2"><span className="font-semibold text-slate-900">{p.name}</span>
                    {!p.isActive && <Badge variant="secondary" className="bg-slate-100">inactive</Badge>}
                    {!p.isPublic && <Badge variant="secondary" className="bg-amber-50 text-amber-700">hidden</Badge>}
                    {p.popular && <Badge className="bg-violet-600">popular</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{fmtINR(p.prices?.INR?.monthly)}/mo · {fmtINR(p.prices?.INR?.yearly)}/yr</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => duplicate(p.id)}><Copy className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(p.limits || {}).slice(0, 4).map(([k, v]) => (
                  <span key={k} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{v === -1 ? '∞' : v} {LIMIT_LABELS[k] || k}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); mutate() }} />}
    </div>
  )
}

/* ------------------------------- Coupons -------------------------------- */
function CouponEditor({ plans, onClose, onSaved }) {
  const [f, setF] = useState({ code: '', type: 'percent', value: 10, maxRedemptions: '', perUserLimit: '', minAmount: '', firstTimeOnly: false, startsAt: '', expiresAt: '', isActive: true, applicablePlanIds: [] })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.code.trim()) { toast.error('Code required'); return }
    setBusy(true)
    try {
      await api('/api/admin/coupons', 'POST', {
        ...f,
        maxRedemptions: f.maxRedemptions ? Number(f.maxRedemptions) : null,
        perUserLimit: f.perUserLimit ? Number(f.perUserLimit) : null,
        minAmount: f.minAmount ? Number(f.minAmount) : 0,
        value: Number(f.value),
      })
      toast.success('Coupon created'); onSaved()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const togglePlan = (id) => setF((s) => ({ ...s, applicablePlanIds: s.applicablePlanIds.includes(id) ? s.applicablePlanIds.filter((x) => x !== id) : [...s.applicablePlanIds, id] }))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>New coupon</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="LAUNCH50" /></div>
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="percent">Percent (%)</SelectItem><SelectItem value="fixed">Fixed (₹)</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Value</Label><Input type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Min amount (₹)</Label><Input type="number" value={f.minAmount} onChange={(e) => setF({ ...f, minAmount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Max redemptions</Label><Input type="number" value={f.maxRedemptions} onChange={(e) => setF({ ...f, maxRedemptions: e.target.value })} placeholder="∞" /></div>
            <div className="space-y-1.5"><Label>Per-user limit</Label><Input type="number" value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value })} placeholder="∞" /></div>
            <div className="space-y-1.5"><Label>Starts</Label><Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Expires</Label><Input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.firstTimeOnly} onCheckedChange={(v) => setF({ ...f, firstTimeOnly: v })} /> First-time only</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Active</label>
          </div>
          <div>
            <Label className="text-xs">Applicable plans <span className="text-slate-400">(none = all)</span></Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(plans || []).map((p) => (
                <button key={p.id} onClick={() => togglePlan(p.id)} className={`rounded-full border px-2.5 py-1 text-xs ${f.applicablePlanIds.includes(p.id) ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>{p.name}</button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-violet-600 hover:bg-violet-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CouponsTab() {
  const { data: coupons, mutate } = useSWR('/api/admin/coupons', fetcher)
  const { data: plans } = useSWR('/api/admin/plans', fetcher)
  const [creating, setCreating] = useState(false)
  const toggle = async (c) => { try { await api(`/api/admin/coupons/${c.id}`, 'PUT', { isActive: !c.isActive }); mutate() } catch (e) { toast.error(e.message) } }
  const remove = async (id) => { try { await api(`/api/admin/coupons/${id}`, 'DELETE'); toast.success('Deleted'); mutate() } catch (e) { toast.error(e.message) } }
  if (!coupons) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setCreating(true)} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-1 h-4 w-4" /> New coupon</Button></div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Discount</TableHead><TableHead>Used</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {coupons.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium">{c.code}</TableCell>
                  <TableCell>{c.type === 'percent' ? `${c.value}%` : fmtINR(c.value)}</TableCell>
                  <TableCell>{c.redemptionCount || 0}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</TableCell>
                  <TableCell>{c.expiresAt ? fmtDate(c.expiresAt) : '—'}</TableCell>
                  <TableCell><Switch checked={c.isActive} onCheckedChange={() => toggle(c)} /></TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {creating && <CouponEditor plans={plans} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); mutate() }} />}
    </div>
  )
}

/* ---------------------------- Subscriptions ----------------------------- */
function SubscriptionsTab() {
  const { data: subs } = useSWR('/api/admin/subscriptions', fetcher)
  if (!subs) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Organization</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Interval</TableHead><TableHead>Period end</TableHead></TableRow></TableHeader>
          <TableBody>
            {subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium text-slate-900">{s.orgName || '—'}</TableCell>
                <TableCell>{s.planName || '—'}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{s.status}{s.cancelAtPeriodEnd ? ' (cancelling)' : ''}</Badge></TableCell>
                <TableCell className="capitalize">{s.interval || '—'}</TableCell>
                <TableCell>{fmtDate(s.currentPeriodEnd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/* ------------------------------- Settings ------------------------------- */
function SettingsTab() {
  const { data: s, mutate } = useSWR('/api/admin/settings', fetcher)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const form = f || s
  if (!form) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
  const set = (patch) => setF({ ...form, ...patch })
  const save = async () => { setBusy(true); try { await api('/api/admin/settings', 'PUT', { taxPercent: Number(form.taxPercent), taxLabel: form.taxLabel, currency: form.currency, announcement: form.announcement, defaultTrialDays: Number(form.defaultTrialDays) }); toast.success('Settings saved'); mutate() } catch (e) { toast.error(e.message) } finally { setBusy(false) } }
  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-2"><CardTitle className="text-base">System settings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Tax percent (%)</Label><Input type="number" value={form.taxPercent} onChange={(e) => set({ taxPercent: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tax label</Label><Input value={form.taxLabel || ''} onChange={(e) => set({ taxLabel: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency || 'INR'} onChange={(e) => set({ currency: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Default trial days</Label><Input type="number" value={form.defaultTrialDays || 0} onChange={(e) => set({ defaultTrialDays: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Announcement banner</Label><Textarea rows={2} value={form.announcement || ''} onChange={(e) => set({ announcement: e.target.value })} placeholder="Shown to all users (optional)" /></div>
        <Button onClick={save} disabled={busy} className="bg-violet-600 hover:bg-violet-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save settings'}</Button>
      </CardContent>
    </Card>
  )
}

/* --------------------------------- Page --------------------------------- */
export default function AdminPage() {
  const { user, role, loading } = useRequireAuth({ admin: true })
  if (loading || !user) return <AuthGate />
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader active="admin" />
      <main className="container py-8">
        <div className="mb-6 flex items-center gap-2">
          <Shield className="h-6 w-6 text-violet-600" />
          <div><h1 className="text-2xl font-bold text-slate-900">Admin panel</h1><p className="text-sm text-slate-500">Manage users, plans, coupons, subscriptions and settings.</p></div>
        </div>
        <Tabs defaultValue="overview">
          <TabsList className="mb-6 flex flex-wrap">
            <TabsTrigger value="overview"><BarChart3 className="mr-1.5 h-4 w-4" /> Overview</TabsTrigger>
            <TabsTrigger value="users"><Users className="mr-1.5 h-4 w-4" /> Users</TabsTrigger>
            <TabsTrigger value="plans"><Layers className="mr-1.5 h-4 w-4" /> Plans</TabsTrigger>
            <TabsTrigger value="coupons"><Ticket className="mr-1.5 h-4 w-4" /> Coupons</TabsTrigger>
            <TabsTrigger value="subs"><IndianRupee className="mr-1.5 h-4 w-4" /> Subscriptions</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="mr-1.5 h-4 w-4" /> Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><Overview /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="plans"><PlansTab /></TabsContent>
          <TabsContent value="coupons"><CouponsTab /></TabsContent>
          <TabsContent value="subs"><SubscriptionsTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
