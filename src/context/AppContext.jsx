import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { cacheClear, cacheGet, cacheSet, flushOutbox, getOutbox, subscribeOutbox } from '../lib/offline'
import { supabase } from '../lib/supabase'

const Ctx = createContext(null)

function initialTheme() {
  try {
    const saved = localStorage.getItem('fa-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function AppProvider({ children }) {
  const now = new Date()
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [theme, setTheme] = useState(initialTheme)
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [toast, setToast] = useState(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pending, setPending] = useState(() => getOutbox().length)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    document.body.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0a0c' : '#ffffff')
    try { localStorage.setItem('fa-theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      // Sin sesión (expirada o de otro usuario): no dejar datos financieros en el dispositivo
      if (!data.session) cacheClear({ keepOutbox: true })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') cacheClear()
      // Llegó desde el enlace de "olvidé mi contraseña": pedir la nueva
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  const loadProfile = useCallback(async () => {
    if (!userId) return setProfile(null)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) return setProfile(cacheGet(`${userId}:profile`) ?? { id: userId, currency: 'CLP', full_name: null })
    if (data) cacheSet(`${userId}:profile`, data)
    setProfile(data ?? { id: userId, currency: 'CLP', full_name: null })
  }, [userId])
  useEffect(() => { loadProfile() }, [loadProfile])

  // Sincroniza movimientos guardados sin conexión al volver la red
  useEffect(() => {
    const unsub = subscribeOutbox((list) => setPending(list.length))
    const sync = async () => {
      setOnline(navigator.onLine)
      if (!navigator.onLine || !userId || !getOutbox().length) return
      const r = await flushOutbox()
      if (r.synced) setToast({ message: r.synced === 1 ? '1 movimiento sincronizado' : r.synced + ' movimientos sincronizados', type: 'ok', id: Date.now() })
      if (r.failed.length) setToast({ message: r.failed.length + ' movimiento(s) no se pudieron guardar: ' + r.failed[0].error, type: 'error', id: Date.now() })
    }
    const goOffline = () => setOnline(false)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', sync)
    return () => {
      unsub()
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [userId])

  const shiftMonth = useCallback((delta) => {
    setPeriod((p) => {
      const idx = p.year * 12 + (p.month - 1) + delta
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
    })
  }, [])

  const notify = useCallback((message, type = 'ok') => {
    setToast({ message, type, id: Date.now() })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      currency: profile?.currency || 'CLP',
      reloadProfile: loadProfile,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      period,
      setPeriod,
      shiftMonth,
      notify,
      online,
      pending,
      recovery,
      endRecovery: () => setRecovery(false)
    }),
    [session, profile, loadProfile, theme, period, shiftMonth, notify, online, pending, recovery]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <div key={toast.id} className={`toast ${toast.type === 'error' ? 'error' : ''}`} role="status">{toast.message}</div>}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
