import { requireUser, parsePeriod } from '../_lib/supabase.js'
import { monthFigures, monthName, nextPeriod } from '../_lib/finance.js'
import { serverError, rateLimit } from '../_lib/http.js'

/**
 * POST /api/months/close
 *   { year, month, savingsAccountId?, toSavings? }  → cierra el mes
 *   { year, month, debt?, installments? }            → cierra un mes en negativo
 *   { year, month, reopen: true }                    → lo reabre
 *
 * Al cerrar: el sobrante se reparte entre un ahorro (se registra como aporte
 * del mes) y el mes siguiente (carry_out). Con déficit, el usuario elige:
 *   debt = 'carry'        → se descuenta completo el mes siguiente
 *   debt = 'installments' → se crea un gasto fijo "Crédito <mes>" en N cuotas
 *   debt = 'forgive'      → el mes siguiente parte sin deuda
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
    // Si el déficit se había pasado a cuotas, se deshace: se borra la deuda si no
    // tiene pagos; si ya tiene pagos, se archiva para no perderlos.
    const debts = await sb.from('accounts').select('id').eq('debt_month_id', month.id)
    if (debts.error && debts.error.code !== '42703') return serverError(res, debts.error)
    let debtKept = 0
    for (const d of debts.data ?? []) {
      const paid = await sb.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', d.id)
      if (paid.error) return serverError(res, paid.error)
      const r = paid.count > 0
        ? (debtKept++, await sb.from('accounts').update({ archived: true, debt_month_id: null }).eq('id', d.id))
        : await sb.from('accounts').delete().eq('id', d.id)
      if (r.error) return serverError(res, r.error)
    }
    const fields = { closed: false, carry_out: 0 }
    if ((debts.data ?? []).length || month.debt_choice) fields.debt_choice = null
    const up = await sb.from('months').update(fields).eq('id', month.id).select().single()
    if (up.error) return serverError(res, up.error)
    return res.json({ month: up.data, debtRemoved: (debts.data ?? []).length - debtKept, debtKept })
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

  let carryOut = Math.round((figures.available - toSavings) * 100) / 100
  const update = { closed: true }
  let debt = null
  if (carryOut < 0) {
    const choice = req.body.debt ?? 'carry'
    if (!['carry', 'installments', 'forgive'].includes(choice)) return res.status(400).json({ error: 'Opción de deuda inválida' })
    update.debt_choice = choice
    if (choice === 'installments') {
      const n = Number(req.body.installments)
      if (!Number.isInteger(n) || n < 1 || n > 60) return res.status(400).json({ error: 'Elige entre 1 y 60 cuotas' })
      const total = -carryOut
      const fee = Math.round((total / n) * 100) / 100
      const start = nextPeriod(period)
      const base = `Crédito ${monthName(period)}`
      let created = null
      for (let i = 1; i <= 5 && !created; i++) {
        const r = await sb
          .from('accounts')
          .insert({
            name: i === 1 ? base : `${base} (${i})`,
            kind: 'fijo',
            default_amount: fee,
            color: '#d6455d',
            sort: 50,
            installments: n,
            installment_start: `${start.year}-${String(start.month).padStart(2, '0')}-01`,
            debt_month_id: month.id
          })
          .select()
          .single()
        if (r.error && r.error.code !== '23505') return serverError(res, r.error)
        created = r.data
      }
      if (!created) return res.status(409).json({ error: 'Ya existe una deuda con ese nombre' })
      // Si el mes siguiente ya está abierto, la primera cuota entra de inmediato
      const next = await sb.from('months').select('id').eq('year', start.year).eq('month', start.month).maybeSingle()
      if (next.error) return serverError(res, next.error)
      if (next.data) {
        const bi = await sb.from('budget_items').upsert({ month_id: next.data.id, account_id: created.id, planned: fee }, { onConflict: 'month_id,account_id' })
        if (bi.error) return serverError(res, bi.error)
      }
      debt = { accountId: created.id, name: created.name, installments: n, fee, total }
      carryOut = 0
    } else if (choice === 'forgive') {
      carryOut = 0
    }
  }
  update.carry_out = carryOut
  const up = await sb.from('months').update(update).eq('id', month.id).select().single()
  if (up.error) return serverError(res, up.error)

  return res.json({ month: up.data, available: figures.available, toSavings, carryOut, debt })
}
