'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const fetcher = (url) => fetch(url).then((r) => r.json())

// Shared session hook. SWR dedupes the /api/auth/me request across components.
export function useSession() {
  const { data, error, isLoading, mutate } = useSWR('/api/auth/me', fetcher, {
    revalidateOnFocus: false,
  })
  const user = data?.user || null
  return {
    user,
    org: data?.org || null,
    entitlements: data?.entitlements || null,
    role: data?.role || user?.role || null,
    loading: isLoading,
    mutate,
  }
}

export function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin'
}

// Guard for protected pages. Redirects to /login when logged out; to /dashboard
// when an admin-only page is opened by a non-admin.
export function useRequireAuth({ admin = false } = {}) {
  const s = useSession()
  const router = useRouter()
  useEffect(() => {
    if (s.loading) return
    if (!s.user) {
      const next = typeof window !== 'undefined' ? window.location.pathname : '/'
      router.replace('/login?next=' + encodeURIComponent(next))
      return
    }
    if (admin && !isAdminRole(s.role)) router.replace('/dashboard')
  }, [s.loading, s.user, s.role, admin, router])
  return s
}
