'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { useSession, isAdminRole } from '@/lib/useSession'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sparkles, Bell, ChevronDown, LayoutGrid, MessageSquareQuote, Gauge,
  CreditCard, User as UserIcon, Shield, LogOut, CheckCheck,
} from 'lucide-react'

const NAV = [
  { key: 'campaigns', label: 'Campaigns', href: '/dashboard', icon: LayoutGrid },
  { key: 'reviews', label: 'Reviews', href: '/reviews', icon: MessageSquareQuote },
  { key: 'audit', label: 'SEO Audit', href: '/audit', icon: Gauge },
]

const fetcher = (url) => fetch(url).then((r) => r.json())

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function NotificationsBell() {
  const { data, mutate } = useSWR('/api/notifications', fetcher, { refreshInterval: 60000 })
  const list = data?.notifications || []
  const unread = data?.unread || 0
  const markRead = async () => {
    await fetch('/api/notifications/read', { method: 'POST' })
    mutate()
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">Notifications</span>
          {unread > 0 && (
            <button onClick={markRead} className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {list.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up.</p>
          )}
          {list.map((n) => (
            <div key={n.id} className={`border-b px-4 py-3 last:border-0 ${n.read ? '' : 'bg-violet-50/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{n.title}</p>
                <span className="whitespace-nowrap text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
              </div>
              {n.body && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{n.body}</p>}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function AppHeader({ active, children }) {
  const router = useRouter()
  const { user, entitlements, role } = useSession()
  const admin = isAdminRole(role)
  const planName = entitlements?.plan?.name || 'Free'
  const initials = (user?.name || user?.email || 'U').trim().slice(0, 1).toUpperCase()

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (e) { /* ignore */ }
    toast.success('Signed out')
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="hidden leading-none sm:block">
              <span className="text-lg font-bold tracking-tight text-slate-900">niuron<span className="text-violet-600">ai</span></span>
              <p className="text-[11px] text-slate-500">Google Business Profile & Local SEO</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const Icon = n.icon
              const on = active === n.key
              return (
                <Link key={n.key} href={n.href}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${on ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <Icon className="h-4 w-4" /> {n.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {children}
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-semibold text-white">{initials}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-slate-900">{user?.name || 'Account'}</span>
                <span className="truncate text-xs font-normal text-slate-500">{user?.email}</span>
                <Badge variant="secondary" className="mt-1.5 w-fit bg-violet-50 text-violet-700">{planName} plan</Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/account')}><UserIcon className="mr-2 h-4 w-4" /> Account</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/billing')}><CreditCard className="mr-2 h-4 w-4" /> Billing & plan</DropdownMenuItem>
              {admin && <DropdownMenuItem onClick={() => router.push('/admin')}><Shield className="mr-2 h-4 w-4" /> Admin panel</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-600"><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

// Full-screen loader used while the auth guard resolves.
export function AuthGate() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-500" />
        </div>
      </div>
    </div>
  )
}
