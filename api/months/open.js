import { requireUser, parsePeriod } from '../_lib/supabase.js'
import { serverError, rateLimit } from '../_lib/http.js'

/**
 * POST /api/months/open  { year, month, income? }
 *
 * Crea la "imagen" del mes. Si ya existe, la devuelve tal cual.
 * - Renta: la indicada, o la del último mes registrado.
 * - Plan por cuenta: lo planificado el mes anterior; las cuentas nuevas
 *   (o el primer mes) toman su monto por defecto.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const ctx = await requireUser(req, res)
  if (!ctx) return
  if (!(await rateLimit(ctx.sb, res, 'months-open', 30, 600))) return
  const { sb, user } = ctx

  const period = parsePeriod(req.body)
  if (!period) return res.status(400).json({ error: 'Periodo inválido' })
  const { year, month } = period

  const existing = await sb.from('months').select('*').eq('year', year).eq('month', month).maybeSingle()
  if (existing.error) return serverError(res, existing.error)
  if (existing.data) return res.json({ month: existing.data, created: false })

  const prev = await sb
    .from('months')
    .select('*')
    .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prev.error) return serverError(res, prev.error)

  const bodyIncome = Number(req.body?.income)
  const income = Number.isFinite(bodyIncome) && bodyIncome >= 0 ? bodyIncome : Number(prev.data?.income ?? 0)

  const inserted = await sb.from('months').insert({ user_id: user.id, year, month, income }).select().single()
  if (inserted.error) {
    // Otro dispositivo lo creó al mismo tiempo: devolvemos el existente.
    if (inserted.error.code === '23505') {
      const again = await sb.from('months').select('*').eq('year', year).eq('month', month).single()
      return res.json({ month: again.data, created: false })
    }
    return serverError(res, inserted.error)
  }
  const newMonth = inserted.data

  const accounts = await sb.from('accounts').select('*').eq('archived', false)
  if (accounts.error) return serverError(res, accounts.error)

  const prevPlan = new Map()
  if (prev.data) {
    const items = await sb.from('budget_items').select('account_id, planned').eq('month_id', prev.data.id)
    if (items.error) return serverError(res, items.error)
    for (const it of items.data) prevPlan.set(it.account_id, Number(it.planned))
  }

  const rows = accounts.data
    .filter((a) => a.kind !== 'ingreso' && !a.is_free)
    .map((a) => ({
      user_id: user.id,
      month_id: newMonth.id,
      account_id: a.id,
      planned: prevPlan.has(a.id) ? prevPlan.get(a.id) : Number(a.default_amount)
    }))

  if (rows.length) {
    const up = await sb.from('budget_items').upsert(rows, { onConflict: 'month_id,account_id', ignoreDuplicates: true })
    if (up.error) return serverError(res, up.error)
  }

  return res.status(201).json({ month: newMonth, created: true, items: rows.length, copiedFrom: prev.data ? { year: prev.data.year, month: prev.data.month } : null })
}
