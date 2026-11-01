import { createClient } from '@supabase/supabase-js'
import { requireUser } from '../_lib/supabase.js'
import { rateLimit, serverError } from '../_lib/http.js'

/**
 * POST /api/account/delete  { confirm: "ELIMINAR" }
 *
 * Derecho de supresión: borra todos los datos del usuario (delete_my_data, como
 * el propio usuario) y luego su cuenta de Auth (requiere service role).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const ctx = await requireUser(req, res)
  if (!ctx) return
  if (!(await rateLimit(ctx.sb, res, 'account-delete', 3, 3600))) return
  const { sb, user } = ctx

  if (req.body?.confirm !== 'ELIMINAR') return res.status(400).json({ error: 'Escribe ELIMINAR para confirmar' })

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[account-delete] falta SUPABASE_SERVICE_ROLE_KEY')
    return res.status(503).json({ error: 'La eliminación de cuentas no está disponible en este momento. Escríbenos para gestionarla.' })
  }

  const purge = await sb.rpc('delete_my_data')
  if (purge.error) return serverError(res, purge.error)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return serverError(res, error)

  return res.json({ deleted: true })
}
