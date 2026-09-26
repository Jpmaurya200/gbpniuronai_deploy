'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import AppHeader, { AuthGate } from '@/components/app/AppHeader'
import { useRequireAuth, isAdminRole } from '@/lib/useSession'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  User as UserIcon, Building2, CreditCard, Shield, ArrowRight,
  MapPin, Loader2, CheckCircle2, Link2, Store, AlertTriangle,
  Pencil, KeyRound, Receipt, Users, UserPlus, Trash2, Mail,
  Plus, RefreshCw,
} from 'lucide-react'

const fetcher = (url) => fetch(url).then((r) => r.json())
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  )
}

function BusinessProfileCard() {
  const { data, mutate, isLoading } = useSWR('/api/gbp/status', (u) => fetch(u).then((r) => r.json()))
  const [disc, setDisc] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [addManualOpen, setAddManualOpen] = useState(false)
  const [manualForm, setManualForm] = useState({ title: '', address: '', mapsUri: '', phone: '' })
  const [savingManual, setSavingManual] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const connected = data?.connected
  const locations = data?.locations || []
  const limit = data?.locationLimit
  const googleOn = data?.googleEnabled

  const connect = () => { window.location.href = '/api/gbp/connect' }
  const disconnect = async () => {
    setDisc(true)
    try {
      await fetch('/api/gbp/disconnect', { method: 'POST' })
      toast.success('Google Business Profile disconnected')
      mutate()
    } catch (e) { toast.error('Could not disconnect') } finally { setDisc(false) }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/gbp/sync', { method: 'POST' })
      const d = await res.json()
      if (d.ok) {
        toast.success(`Successfully synced ${d.count} location(s) from Google!`)
        mutate()
      } else {
        toast.error(d.error || 'Could not sync locations from Google')
        mutate()
      }
    } catch (err) {
      toast.error(err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleAddManual = async (e) => {
    e.preventDefault()
    if (!manualForm.title.trim()) {
      toast.error('Business name is required')
      return
    }
    setSavingManual(true)
    try {
      const res = await fetch('/api/gbp/location/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not add location')
      toast.success(`Added "${manualForm.title}" successfully!`)
      setManualForm({ title: '', address: '', mapsUri: '', phone: '' })
      setAddManualOpen(false)
      mutate()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingManual(false)
    }
  }

  const handleDeleteLocation = async (id, title) => {
    if (!confirm(`Are you sure you want to remove "${title}"?`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/gbp/location/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not delete location')
      toast.success('Location removed')
      mutate()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4 text-violet-600" /> Google Business Profile</CardTitle>
            {connected ? <Badge className="bg-emerald-600">Connected</Badge> : <Badge variant="secondary">Not connected</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
          ) : !googleOn ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> Google connection is being configured. Check back shortly.
            </div>
          ) : !connected ? (
            <div>
              <p className="mb-3 text-sm text-slate-500">Securely connect your Google Business Profile to sync locations, reviews and rankings. Your plan allows <b>{limit === -1 ? 'unlimited' : limit}</b> location{limit === 1 ? '' : 's'}.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={connect} className="bg-violet-600 hover:bg-violet-700"><Link2 className="mr-1.5 h-4 w-4" /> Connect Google Business Profile</Button>
                <Button variant="outline" onClick={() => setAddManualOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add Location Manually</Button>
              </div>

              {data?.redirectUri && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Google Cloud Console Redirect URI:</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(data.redirectUri)
                        toast.success('Redirect URI copied to clipboard!')
                      }}
                      className="flex items-center gap-1 font-sans text-xs font-semibold text-violet-600 hover:text-violet-700"
                    >
                      Copy URI
                    </button>
                  </div>
                  <div className="mt-1.5 truncate rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-800">
                    {data.redirectUri}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Make sure this exact URI is listed in <b>Authorized redirect URIs</b> in Google Cloud Console.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-slate-500">{locations.length} of {limit === -1 ? '∞' : limit} location{locations.length === 1 ? '' : 's'} linked</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
                    {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    {syncing ? 'Syncing...' : 'Re-sync Google'}
                  </Button>
                  <Button size="sm" variant="outline" className="text-violet-700 hover:text-violet-800" onClick={() => setAddManualOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Location
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" onClick={disconnect} disabled={disc}>
                    {disc ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disconnect'}
                  </Button>
                </div>
              </div>

              {locations.length === 0 ? (
                <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
                    <div className="space-y-1.5">
                      <p className="font-semibold text-amber-900">Connected, but no locations synced yet.</p>
                      <p>This happens when Google Business Profile API is awaiting approval or the listing is under a different account group.</p>
                      {data?.lastSyncError && (
                        <div className="rounded bg-amber-100/80 p-2 font-mono text-[11px] text-amber-950 break-words">
                          <b>Google Diagnostic:</b> {data.lastSyncError}
                        </div>
                      )}
                      <div className="pt-1 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={handleSync} disabled={syncing}>
                          {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                          Re-sync with Google
                        </Button>
                        <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setAddManualOpen(true)}>
                          <Plus className="h-3 w-3 mr-1" /> Add Location Manually
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {locations.map((l) => (
                    <div key={l.id || l.resourceName} className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <MapPin className="mt-0.5 h-4 w-4 flex-none text-violet-500" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-slate-900">{l.title || l.resourceName}</p>
                            {l.isManual ? (
                              <Badge variant="outline" className="text-[10px] py-0 px-1 text-slate-500">Manual</Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-0 px-1">Google</Badge>
                            )}
                          </div>
                          {l.address && <p className="truncate text-xs text-slate-400">{l.address}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {l.mapsUri && (
                          <a href={l.mapsUri} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-violet-600 text-xs">
                            <Link2 className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-rose-600"
                          onClick={() => handleDeleteLocation(l.id, l.title)}
                          disabled={deletingId === l.id}
                        >
                          {deletingId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addManualOpen} onOpenChange={setAddManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Business Location</DialogTitle>
            <DialogDescription>
              Link your business name and Google Maps review link so campaigns and reviews can start immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddManual} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Business Name *</Label>
              <Input
                required
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                placeholder="e.g. Aroma Bistro & Cafe"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address / City</Label>
              <Input
                value={manualForm.address}
                onChange={(e) => setManualForm({ ...manualForm, address: e.target.value })}
                placeholder="e.g. Connaught Place, New Delhi"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Google Maps / Review URL</Label>
              <Input
                value={manualForm.mapsUri}
                onChange={(e) => setManualForm({ ...manualForm, mapsUri: e.target.value })}
                placeholder="https://g.page/r/... or https://maps.app.goo.gl/..."
              />
              <p className="text-[11px] text-slate-400">Where customers will be redirected to leave a review.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone Number (Optional)</Label>
              <Input
                value={manualForm.phone}
                onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddManualOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-violet-600 hover:bg-violet-700" disabled={savingManual}>
                {savingManual ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Save Location
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TeamCard({ isOwnerOrAdmin, router }) {
  const { data, mutate, isLoading } = useSWR('/api/team', fetcher)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [submitting, setSubmitting] = useState(false)
  const [actionBusy, setActionBusy] = useState(null)

  const members = data?.members || []
  const pendingInvites = data?.pendingInvites || []
  const seatLimit = data?.seatLimit ?? 1
  const usedSeats = data?.usedSeats ?? members.length
  const pendingCount = data?.pendingSeats ?? pendingInvites.length
  const totalOccupied = usedSeats + pendingCount
  const isFull = seatLimit !== -1 && totalOccupied >= seatLimit

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(d.reason || 'Seat limit reached. Upgrade your plan to invite more members.')
          router.push('/billing')
          return
        }
        throw new Error(d.error || 'Failed to send invite')
      }
      toast.success(`Invitation sent to ${email}`)
      setEmail('')
      setRole('member')
      setInviteOpen(false)
      mutate()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelInvite = async (inviteId) => {
    setActionBusy(inviteId)
    try {
      const res = await fetch(`/api/team/invite/${inviteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not cancel invite')
      toast.success('Invitation cancelled')
      mutate()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionBusy(null)
    }
  }

  const handleRemoveMember = async (memId, memName) => {
    if (!confirm(`Are you sure you want to remove ${memName || 'this member'} from the workspace?`)) return
    setActionBusy(memId)
    try {
      const res = await fetch(`/api/team/member/${memId}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not remove member')
      toast.success('Team member removed')
      mutate()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-violet-600" /> Team Members & Seats
              </CardTitle>
              <CardDescription>
                Collaborate with team members across reviews, audits, and campaigns.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isFull ? 'destructive' : 'secondary'} className="font-mono text-xs">
                {totalOccupied} / {seatLimit === -1 ? '∞' : seatLimit} seats
              </Badge>
              {isOwnerOrAdmin && (
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 h-8 gap-1.5"
                  onClick={() => {
                    if (isFull) {
                      toast.info('Workspace seat limit reached. Upgrade to add more seats.')
                      router.push('/billing')
                    } else {
                      setInviteOpen(true)
                    }
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Invite Member
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active Members */}
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3.5 py-3 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 uppercase">
                        {(m.name || m.email || 'U').slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900 truncate">{m.name || 'Team Member'}</p>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] uppercase font-semibold tracking-wider ${
                              m.role === 'owner'
                                ? 'bg-amber-100 text-amber-800'
                                : m.role === 'admin'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {m.role}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                      {isOwnerOrAdmin && !m.isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleRemoveMember(m.id, m.name || m.email)}
                          disabled={actionBusy === m.id}
                        >
                          {actionBusy === m.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pending Invites */}
              {pendingInvites.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Pending Invitations ({pendingInvites.length})
                  </p>
                  <div className="divide-y divide-slate-100 rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                    {pendingInvites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-slate-400 flex-none" />
                          <span className="font-medium text-slate-800 truncate">{inv.email}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {inv.role}
                          </Badge>
                          <span className="text-slate-400 hidden sm:inline">
                            · expires {fmtDate(inv.expiresAt)}
                          </span>
                        </div>
                        {isOwnerOrAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-slate-500 hover:text-rose-600"
                            onClick={() => handleCancelInvite(inv.id)}
                            disabled={actionBusy === inv.id}
                          >
                            {actionBusy === inv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Cancel'
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Member Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an email invitation to join your <b>niuronai</b> workspace.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Work Email Address</Label>
              <Input
                id="inv-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@yourcompany.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-role">Role & Permissions</Label>
              <select
                id="inv-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="member">Member — view and manage reviews, campaigns, audits</option>
                <option value="admin">Admin — manage team members, integrations, settings</option>
              </select>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending Invite…
                  </>
                ) : (
                  'Send Invitation'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function AccountPage() {
  const router = useRouter()
  const { user, org, entitlements, role, loading, mutate: mutateSession } = useRequireAuth()
  const { data: ent } = useSWR('/api/me/entitlements', fetcher)
  const e = ent || entitlements

  // Edit Profile modal
  const [profileOpen, setProfileOpen] = useState(false)
  const [name, setName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // Change Password modal
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Edit Workspace & Billing Profile modal
  const [orgOpen, setOrgOpen] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [gstin, setGstin] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [phone, setPhone] = useState('')
  const [orgSaving, setOrgSaving] = useState(false)

  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user])

  useEffect(() => {
    if (org) {
      setOrgName(org.name || '')
      setLegalName(org.billingProfile?.legalName || '')
      setGstin(org.billingProfile?.gstin || '')
      setAddress(org.billingProfile?.address || '')
      setCity(org.billingProfile?.city || '')
      setState(org.billingProfile?.state || '')
      setPostalCode(org.billingProfile?.postalCode || '')
      setPhone(org.billingProfile?.phone || '')
    }
  }, [org])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const gbp = params.get('gbp')
    if (gbp === 'connected') {
      const count = params.get('count') || '0'
      toast.success(`Google Business Profile connected! (${count} location${count === '1' ? '' : 's'} linked)`)
    } else if (gbp === 'denied') {
      toast.error('Google authorization was cancelled or denied.')
    } else if (gbp === 'norefresh') {
      toast.error('Google did not return a refresh token. Try revoking app access in Google Account permissions and reconnecting.')
    } else if (gbp === 'state') {
      toast.error('OAuth security state verification failed. Please try again.')
    } else if (gbp === 'failed') {
      toast.error('Google connection failed. Check Authorized redirect URIs in Google Cloud Console.')
    }
  }, [])

  if (loading || !user) return <AuthGate />

  const handleUpdateProfile = async (ev) => {
    ev.preventDefault()
    if (!name.trim()) { toast.error('Name cannot be empty'); return }
    setProfileSaving(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update profile')
      toast.success('Profile updated')
      setProfileOpen(false)
      mutateSession()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async (ev) => {
    ev.preventDefault()
    if (!newPw || newPw.length < 6) { toast.error('New password must be at least 6 characters'); return }
    if (newPw !== confirmPw) { toast.error('New passwords do not match'); return }
    setPwSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      toast.success('Password updated successfully')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setPwOpen(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPwSaving(false)
    }
  }

  const handleUpdateOrg = async (ev) => {
    ev.preventDefault()
    setOrgSaving(true)
    try {
      const res = await fetch('/api/account/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          billingProfile: {
            legalName,
            gstin,
            address,
            city,
            state,
            postalCode,
            phone,
            country: 'IN',
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update workspace')
      toast.success('Workspace & billing details updated')
      setOrgOpen(false)
      mutateSession()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setOrgSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader active="account" />
      <main className="container max-w-3xl py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Account settings</h1>
          <p className="text-sm text-slate-500">Your profile, workspace, and Google integrations.</p>
        </div>

        <div className="space-y-6">
          {/* User Profile Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base"><UserIcon className="h-4 w-4 text-violet-600" /> Profile</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setProfileOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit Profile
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setPwOpen(true)}>
                    <KeyRound className="h-3.5 w-3.5" /> Change Password
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100">
              <Row label="Name" value={user?.name || '—'} />
              <Row label="Email" value={user?.email} />
              <Row label="Role" value={<Badge variant="secondary" className="capitalize">{(role || 'owner').replace('_', ' ')}</Badge>} />
              <Row label="Member since" value={fmtDate(user?.createdAt)} />
            </CardContent>
          </Card>

          {/* Workspace & Billing Details Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-violet-600" /> Workspace & Billing Details</CardTitle>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setOrgOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit Details
                </Button>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100">
              <Row label="Organization name" value={org?.name || '—'} />
              <Row label="Legal business name" value={org?.billingProfile?.legalName || <span className="text-slate-400 italic">Not set</span>} />
              <Row label="GSTIN" value={org?.billingProfile?.gstin ? <span className="font-mono font-semibold">{org.billingProfile.gstin}</span> : <span className="text-slate-400 italic">Unregistered consumer</span>} />
              <Row label="Billing address" value={org?.billingProfile?.address ? `${org.billingProfile.address}, ${org.billingProfile.city || ''}` : <span className="text-slate-400 italic">Not set</span>} />
              <Row label="Country / currency" value={`${org?.billingProfile?.country || 'IN'} · ${org?.billingProfile?.currency || 'INR'}`} />
            </CardContent>
          </Card>

          {/* Google Business Profile Connection */}
          <BusinessProfileCard />

          {/* Team Members & Seat Management */}
          <TeamCard isOwnerOrAdmin={isAdminRole(role) || role === 'owner'} router={router} />

          {/* Subscription Card */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-violet-600" /> Subscription</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg bg-violet-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{e?.plan?.name || 'Free'} plan</p>
                  <p className="text-xs text-slate-500">{e?.subscription?.cancelAtPeriodEnd ? `Ends ${fmtDate(e?.subscription?.currentPeriodEnd)}` : e?.subscription?.currentPeriodEnd ? `Renews ${fmtDate(e?.subscription?.currentPeriodEnd)}` : 'No renewal date'}</p>
                </div>
                <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => router.push('/billing')}>Manage <ArrowRight className="ml-1 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Admin Panel Link */}
          {isAdminRole(role) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-violet-600" /> Administration</CardTitle></CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => router.push('/admin')}>Open admin panel <ArrowRight className="ml-1 h-4 w-4" /></Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Edit Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your personal display name.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateProfile} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="prof-name">Full Name</Label>
              <Input id="prof-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setProfileOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={profileSaving} className="bg-violet-600 hover:bg-violet-700">
                {profileSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Choose a secure password of at least 6 characters.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="curr-pw">Current Password</Label>
              <Input id="curr-pw" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New Password</Label>
              <Input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conf-pw">Confirm New Password</Label>
              <Input id="conf-pw" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="••••••••" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPwOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pwSaving} className="bg-violet-600 hover:bg-violet-700">
                {pwSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…</> : 'Update Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Workspace & Billing Details Dialog */}
      <Dialog open={orgOpen} onOpenChange={setOrgOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Workspace & Tax Billing Profile</DialogTitle>
            <DialogDescription>These details will appear on your GST tax invoices.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateOrg} className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label htmlFor="org-name">Workspace / Organization Name</Label>
              <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Clinic" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="legal-name">Legal Entity Name</Label>
                <Input id="legal-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme Healthcare Pvt Ltd" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="org-gstin">GSTIN (India)</Label>
                <Input id="org-gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27AAAAA0000A1Z5" maxLength={15} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-addr">Billing Street Address</Label>
              <Input id="org-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop 4, MG Road" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="org-city">City</Label>
                <Input id="org-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="org-state">State</Label>
                <Input id="org-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="Karnataka" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="org-pin">Postal Code</Label>
                <Input id="org-pin" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="560001" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-phone">Phone Number</Label>
              <Input id="org-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setOrgOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={orgSaving} className="bg-violet-600 hover:bg-violet-700">
                {orgSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Save Billing Profile'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
