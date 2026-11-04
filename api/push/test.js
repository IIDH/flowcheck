import { requireUser } from '../_lib/supabase.js'
import { sendPush } from '../_lib/push.js'
import { serverError, rateLimit } from '../_lib/http.js'

/** POST /api/push/test — envía una notificación de prueba a los dispositivos del usuario. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const ctx = await requireUser(req, res)
  if (!ctx) return
  if (!(await rateLimit(ctx.sb, res, 'push-test', 5, 3600))) return
  const { sb } = ctx

  const { data: subs, error } = await sb.from('push_subscriptions').select('*')
  if (error) return serverError(res, error)
  if (!subs.length) return res.status(400).json({ error: 'Este usuario no tiene dispositivos con notificaciones activas' })

  try {
    const { sent, gone } = await sendPush(subs, {
      title: 'Flowcheck · prueba',
      body: 'Así te avisaremos cuando un gasto fijo esté por vencer.',
      url: '/presupuesto',
      tag: 'flowcheck-test'
    })
    if (gone.length) await sb.from('push_subscriptions').delete().in('id', gone)
    return res.json({ sent, removed: gone.length })
  } catch (err) {
    return serverError(res, err)
  }
}
