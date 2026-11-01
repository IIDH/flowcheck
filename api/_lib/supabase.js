import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

/**
 * Valida el JWT del usuario y devuelve un cliente Supabase que actúa como él,
 * de modo que todas las consultas respetan RLS. Responde 401 si no hay sesión.
 */
export async function requireUser(req, res) {
  // Nunca cachear respuestas con datos financieros
  res.setHeader('Cache-Control', 'no-store')
  if (!url || !anonKey) {
    res.status(500).json({ error: 'Faltan SUPABASE_URL / SUPABASE_ANON_KEY en el servidor' })
    return null
  }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'No autenticado' })
    return null
  }
  const sb = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: 'Sesión inválida o expirada' })
    return null
  }
  return { sb, user: data.user }
}

export function parsePeriod(source) {
  const year = Number.parseInt(source?.year, 10)
  const month = Number.parseInt(source?.month, 10)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}
