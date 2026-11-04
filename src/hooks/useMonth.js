import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { cacheGet, cacheSet, isNetworkError } from '../lib/offline'
import { supabase } from '../lib/supabase'

/** Mes seleccionado + filas plan vs real por cuenta (vista month_account_summary). */
export function useMonth() {
  const { period, user } = useApp()
  const [state, setState] = useState({ loading: true, month: null, rows: [], carryIn: 0, error: null, stale: false })
  const key = `${user?.id}:month:${period.year}-${period.month}`

  const load = useCallback(async () => {
    const fromCache = (error) => {
      const cached = cacheGet(key)
      setState(cached ? { loading: false, ...cached, error: null, stale: true } : { loading: false, month: null, rows: [], error, stale: true })
    }
    const m = await supabase.from('months').select('*').eq('year', period.year).eq('month', period.month).maybeSingle()
    if (m.error) return isNetworkError(m.error) ? fromCache(m.error) : setState({ loading: false, month: null, rows: [], error: m.error, stale: false })
    if (!m.data) {
      cacheSet(key, { month: null, rows: [] })
      return setState({ loading: false, month: null, rows: [], error: null, stale: false })
    }
    const [r, prev] = await Promise.all([
      supabase.from('month_account_summary').select('*').eq('month_id', m.data.id),
      supabase
        .from('months')
        .select('*')
        .or(`year.lt.${period.year},and(year.eq.${period.year},month.lt.${period.month})`)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])
    if (r.error && isNetworkError(r.error)) return fromCache(r.error)
    // Sobrante o déficit que dejó el mes anterior al cerrarse
    const carryIn = prev.data?.closed ? Number(prev.data.carry_out ?? 0) : 0
    const next = { month: m.data, carryIn, rows: (r.data ?? []).map((x) => ({ ...x, planned: Number(x.planned), actual: Number(x.actual), withdrawn: Number(x.withdrawn ?? 0) })) }
    cacheSet(key, next)
    setState({ loading: false, ...next, error: r.error, stale: false })
  }, [period.year, period.month, key])

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    load()
  }, [load])

  // Se recarga cuando se anota algo desde la hoja "+" o se sincroniza la cola
  useEffect(() => {
    window.addEventListener('fa-synced', load)
    return () => window.removeEventListener('fa-synced', load)
  }, [load])

  return { ...state, reload: load }
}

export function useAccounts({ includeArchived = false } = {}) {
  const { user } = useApp()
  const [accounts, setAccounts] = useState(null)
  const key = `${user?.id}:accounts:${includeArchived ? 'all' : 'active'}`
  const load = useCallback(async () => {
    let q = supabase.from('accounts').select('*').order('sort').order('name')
    if (!includeArchived) q = q.eq('archived', false)
    const { data, error } = await q
    if (error && isNetworkError(error)) return setAccounts(cacheGet(key) ?? [])
    cacheSet(key, data ?? [])
    setAccounts(data ?? [])
  }, [includeArchived, key])
  useEffect(() => { load() }, [load])
  return { accounts, reload: load }
}
