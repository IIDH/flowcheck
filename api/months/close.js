import { requireUser, parsePeriod } from '../_lib/supabase.js'
import { monthFigures } from '../_lib/finance.js'
import { serverError, rateLimit } from '../_lib/http.js'

/**
 * POST /api/months/close
 *   { year, month, savingsAccountId?, toSavings? }  → cierra el mes
 *   { year, month, reopen: true }                    → lo reabre
 *
 * Al cerrar: el sobrante se reparte entre un ahorro (se registra como aporte
 * del mes) y el mes siguiente (carry_out). Un déficit pasa completo al siguiente.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const ctx = await requireUser(req, res)
  if (!ctx) return
  if (!(await rateLimit(ctx.sb, res, 'months-close', 30, 600))) return
  const { sb } = ctx

  const period = parsePeriod(req.body)
  if (!period) return res.status(400).json({ error: 'Periodo inválido' })

  const m = await sb.from('months').select('*').eq('year', period.year).eq('month', period.month).maybeSingle()
  if (m.error) return serverError(res, m.error)
  if (!m.data) return res.status(404).json({ error: 'El mes no existe' })
  const month = m.data

  if (req.body.reopen) {
    const up = await sb.from('months').update({ closed: false, carry_out: 0 }).eq('id', month.id).select().single()
    if (up.error) return serverError(res, up.error)
    return res.json({ month: up.data })
  }
  if (month.closed) return res.status(409).json({ error: 'El mes ya está cerrado' })

  let figures
  try {
    figures = await monthFigures(sb, month)
  } catch (err) {
    return serverError(res, err)
  }

  const toSavings = Math.round(Math.max(Number(req.body.toSavings) || 0, 0) * 100) / 100
  if (toSavings > 0) {
    if (toSavings > figures.available) return res.status(400).json({ error: 'No puedes mandar al ahorro más de lo que sobró' })
    if (!req.body.savingsAccountId) return res.status(400).json({ error: 'Elige la cuenta de ahorro' })
    const acc = await sb.from('accounts').select('id, kind').eq('id', req.body.savingsAccountId).maybeSingle()
    if (acc.error || acc.data?.kind !== 'ahorro') return res.status(400).json({ error: 'La cuenta elegida no es de ahorro' })

    const lastDay = new Date(period.year, period.month, 0).getDate()
    const tx = await sb.from('transactions').insert({
      month_id: month.id,
      account_id: acc.data.id,
      amount: toSavings,
      occurred_on: `${period.year}-${String(period.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      description: 'Sobrante del mes'
    })
    if (tx.error) return serverError(res, tx.error)
  }

  const carryOut = Math.round((figures.available - toSavings) * 100) / 100
  const up = await sb.from('months').update({ closed: true, carry_out: carryOut }).eq('id', month.id).select().single()
  if (up.error) return serverError(res, up.error)

  return res.json({ month: up.data, available: figures.available, toSavings, carryOut })
}
