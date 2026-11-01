import { supabase } from './supabase'

/** Llama a la API Node (/api/*) con el JWT de la sesión actual. */
export async function api(path, { method = 'GET', body } = {}) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
  return json
}

export const openMonth = (period, income) => api('/months/open', { method: 'POST', body: { ...period, income } })

export const fetchSummary = ({ year, month }) => api(`/summary?year=${year}&month=${month}&today=${todayISO()}`)

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
