'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Client auth guard + context loader. Redirects to /login when required.
export function useAuth({ require: req = true, admin = false } = {}) {
  const [state, setState] = useState({ loading: true, user: null, org: null, ent: null, role: null })
  const router = useRouter()
  useEffect(() => {
    let active = true
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return
        if (req && !d.user) { router.replace('/login?next=' + encodeURIComponent(window.location.pathname)); return }
        if (admin && !(d.role === 'admin' || d.role === 'super_admin')) { router.replace('/dashboard'); return }
        setState({ loading: false, user: d.user, org: d.org, ent: d.entitlements, role: d.role })
      })
      .catch(() => { if (req && active) router.replace('/login') })
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/'
}
