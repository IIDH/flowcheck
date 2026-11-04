import { createClient } from '@supabase/supabase-js'
import { sendPush } from '../_lib/push.js'
import { serverError, safeEqual } from '../_lib/http.js'

/**
 * GET /api/cron/reminders  (Vercel Cron, 1 vez al día — ver vercel.json)
 *
 * Para cada usuario con recordatorios activos busca gastos fijos que vencen hoy
 * o en `remind_days_before` días y que aún no están pagados en la imagen del mes,
 * y envía un push a sus dispositivos. `?dry=1` calcula sin enviar.
 * Requiere SUPABASE_SERVICE_ROLE_KEY y CRON_SECRET (solo en el servidor).
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret || !safeEqual(req.headers.authorization, `Bearer ${secret}`)) return res.status(401).json({ error: 'No autorizado' })

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const dry = req.query?.dry === '1'

  const accounts = await admin
    .from('accounts')
    .select('id, user_id, name, default_amount, due_day')
    .eq('kind', 'fijo')
    .eq('archived', false)
    .not('due_day', 'is', null)
  if (accounts.error) return serverError(res, accounts.error)

  const userIds = [...new Set(accounts.data.map((a) => a.user_id))]
  if (!userIds.length) return res.json({ users: 0, notifications: 0 })

  const [profiles, subs] = await Promise.all([
    admin.from('profiles').select('id, currency, timezone, reminders_enabled, remind_days_before').in('id', userIds),
    admin.from('push_subscriptions').select('*').in('user_id', userIds)
  ])
  if (profiles.error || subs.error) return serverError(res, (profiles.error || subs.error))

  const report = []
  for (const userId of userIds) {
    const profile = profiles.data.find((p) => p.id === userId) || { currency: 'CLP', timezone: 'America/Santiago', reminders_enabled: true, remind_days_before: 2 }
    const userSubs = subs.data.filter((s) => s.user_id === userId)
    if (!profile.reminders_enabled || !userSubs.length) continue

    const today = todayIn(profile.timezone)
    const dim = new Date(today.year, today.month, 0).getDate()
    const due = accounts.data
      .filter((a) => a.user_id === userId)
      .map((a) => ({ ...a, diff: Math.min(a.due_day, dim) - today.day }))
      .filter((a) => a.diff === 0 || a.diff === profile.remind_days_before)
    if (!due.length) continue

    // Monto pendiente según la imagen del mes (o el monto por defecto si el mes aún no se abrió)
    const month = await admin.from('months').select('id').eq('user_id', userId).eq('year', today.year).eq('month', today.month).maybeSingle()
    let summary = null
    if (month.data) {
      const r = await admin.from('month_account_summary').select('account_id, planned, actual').eq('month_id', month.data.id)
      summary = new Map((r.data ?? []).map((x) => [x.account_id, x]))
    }
    const pending = due
      .map((a) => {
        if (!summary) return { ...a, amount: Number(a.default_amount) }
        const row = summary.get(a.id)
        if (!row) return null // la quitó de la imagen de este mes
        return { ...a, amount: Number(row.planned) - Number(row.actual) }
      })
      .filter((a) => a && a.amount > 0)
    if (!pending.length) continue

    // No repetir el mismo aviso el mismo día
    const sentOn = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`
    let fresh = pending
    if (!dry) {
      const log = await admin
        .from('reminder_log')
        .upsert(pending.map((a) => ({ user_id: userId, account_id: a.id, sent_on: sentOn })), { onConflict: 'user_id,account_id,sent_on', ignoreDuplicates: true })
        .select('account_id')
      if (log.error) {
        console.error(log.error)
        continue
      }
      const ids = new Set(log.data.map((l) => l.account_id))
      fresh = pending.filter((a) => ids.has(a.id))
    }
    if (!fresh.length) continue

    const payload = buildPayload(fresh, profile.currency)
    let result = { sent: 0, gone: [] }
    if (!dry) {
      result = await sendPush(userSubs, payload)
      if (result.gone.length) await admin.from('push_subscriptions').delete().in('id', result.gone)
    }
    report.push({ userId, accounts: fresh.map((a) => a.name), sent: result.sent, payload: dry ? payload : undefined })
  }

  return res.json({ dry, users: report.length, notifications: report.reduce((s, r) => s + r.sent, 0), report })
}

function todayIn(timeZone) {
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date())
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date())
  }
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

function buildPayload(items, currency) {
  let fmt
  try {
    fmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 })
  } catch {
    fmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
  }
  const when = (d) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`)
  if (items.length === 1) {
    const a = items[0]
    return { title: `${a.name} vence ${when(a.diff)}`, body: `${fmt.format(a.amount)} pendiente. Toca para marcarlo como pagado.`, url: '/presupuesto', tag: `due-${a.id}` }
  }
  const total = items.reduce((s, a) => s + a.amount, 0)
  return {
    title: `${items.length} gastos fijos por vencer`,
    body: `${items.map((a) => `${a.name} (${when(a.diff)})`).join(', ')} · ${fmt.format(total)} en total`,
    url: '/presupuesto',
    tag: 'due-many'
  }
}
