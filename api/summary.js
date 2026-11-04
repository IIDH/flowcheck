import { requireUser, parsePeriod } from './_lib/supabase.js'
import { serverError, rateLimit } from './_lib/http.js'

const KINDS = ['fijo', 'variable', 'ahorro', 'ingreso']

function byKind(rows) {
  const out = Object.fromEntries(KINDS.map((k) => [k, { planned: 0, actual: 0 }]))
  for (const r of rows) {
    out[r.kind].planned += Number(r.planned)
    out[r.kind].actual += Number(r.actual)
  }
  return out
}

const round = (n) => Math.round(n * 100) / 100

/**
 * GET /api/summary?year=2026&month=10&today=2026-10-30
 *
 * Dashboard del mes: KPIs, plan vs real por tipo y por cuenta, alertas,
 * proyección del gasto variable e historial de los últimos 12 meses.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
  const ctx = await requireUser(req, res)
  if (!ctx) return
  if (!(await rateLimit(ctx.sb, res, 'summary', 120, 300))) return
  const { sb } = ctx

  const period = parsePeriod(req.query)
  if (!period) return res.status(400).json({ error: 'Periodo inválido' })
  const { year, month } = period

  const months = await sb
    .from('months')
    .select('*')
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(12)
  if (months.error) return serverError(res, months.error)

  const ids = months.data.map((m) => m.id)
  let rows = []
  if (ids.length) {
    const r = await sb.from('month_account_summary').select('*').in('month_id', ids)
    if (r.error) return serverError(res, r.error)
    rows = r.data.map((x) => ({ ...x, planned: Number(x.planned), actual: Number(x.actual), withdrawn: Number(x.withdrawn ?? 0) }))
  }

  const history = [...months.data].reverse().map((m) => {
    const k = byKind(rows.filter((r) => r.month_id === m.id))
    return {
      year: m.year,
      month: m.month,
      renta: Number(m.income) + k.ingreso.actual,
      gastado: round(k.fijo.actual + k.variable.actual),
      ahorrado: round(k.ahorro.actual),
      planGasto: round(k.fijo.planned + k.variable.planned)
    }
  })

  const current = months.data.find((m) => m.year === year && m.month === month) || null
  if (!current) return res.json({ month: null, history })

  const accounts = rows
    .filter((r) => r.month_id === current.id)
    .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.sort - b.sort || a.name.localeCompare(b.name))
  const k = byKind(accounts)

  const renta = Number(current.income)
  const extra = k.ingreso.actual
  const plannedSpend = k.fijo.planned + k.variable.planned
  const spent = k.fijo.actual + k.variable.actual
  const plannedSave = k.ahorro.planned
  const saved = k.ahorro.actual
  // Sobrante (o déficit) que dejó el mes anterior al cerrarse
  const prevMonth = months.data[months.data.indexOf(current) + 1]
  const carryIn = prevMonth?.closed ? Number(prevMonth.carry_out ?? 0) : 0
  // Retiros de ahorro del mes: entran como plata disponible (saldo libre)
  const withdrawn = round(accounts.reduce((t, a) => t + a.withdrawn, 0))
  const totalIncome = renta + extra + carryIn + withdrawn
  // Base para repartir: sueldo + abonos/otros ingresos + arrastre + retiros
  const planBase = totalIncome

  const kpis = {
    renta,
    extra,
    carryIn,
    withdrawn,
    planBase,
    totalIncome,
    plannedSpend,
    spent,
    plannedSave,
    saved,
    unassigned: round(planBase - plannedSpend - plannedSave),
    available: round(totalIncome - spent - saved),
    savingsRate: totalIncome > 0 ? saved / totalIncome : 0,
    plannedSavingsRate: renta > 0 ? plannedSave / renta : 0,
    // Saldo libre: lo sin asignar de la imagen que se puede gastar sin cuenta
    freeUsed: round(accounts.filter((a) => a.is_free).reduce((t, a) => t + a.actual, 0))
  }
  kpis.freeLeft = round(kpis.unassigned - kpis.freeUsed)

  // Proyección del gasto variable al cierre (solo si el periodo es el mes en curso)
  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today || '') ? new Date(`${req.query.today}T12:00:00`) : new Date()
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month
  const daysInMonth = new Date(year, month, 0).getDate()
  let projection = null
  if (isCurrent && !current.closed) {
    const day = today.getDate()
    const projectedVariable = (k.variable.actual / day) * daysInMonth
    projection = {
      day,
      daysInMonth,
      variableActual: k.variable.actual,
      variablePlanned: k.variable.planned,
      projectedVariable: round(projectedVariable),
      projectedSpend: round(k.fijo.planned + Math.max(projectedVariable, 0)),
      dailyBudgetLeft: day < daysInMonth ? round(Math.max(k.variable.planned - k.variable.actual, 0) / (daysInMonth - day + 1)) : 0
    }
  }

  const alerts = []
  if (kpis.unassigned < 0) alerts.push({ level: 'danger', type: 'plan_over_income', amount: -kpis.unassigned })
  for (const a of accounts) {
    if ((a.kind === 'fijo' || a.kind === 'variable') && !a.is_free) {
      if (a.planned > 0 && a.actual > a.planned) alerts.push({ level: 'danger', type: 'over_budget', account: a.name, amount: round(a.actual - a.planned) })
      else if (a.planned === 0 && a.actual > 0) alerts.push({ level: 'warn', type: 'unplanned', account: a.name, amount: a.actual })
    }
  }
  if (kpis.freeUsed > 0 && kpis.freeLeft < 0) alerts.push({ level: 'danger', type: 'free_over', amount: -kpis.freeLeft })
  if (withdrawn > 0) {
    const list = accounts.filter((a) => a.withdrawn > 0)
    alerts.push({ level: 'info', type: 'withdrawn', amount: withdrawn, accounts: list.map((a) => a.name) })
  }
  const pendingFixed = accounts.filter((a) => a.kind === 'fijo' && a.actual < a.planned)
  if (pendingFixed.length) {
    alerts.push({
      level: 'info',
      type: 'pending_fixed',
      count: pendingFixed.length,
      amount: round(pendingFixed.reduce((s, a) => s + (a.planned - a.actual), 0)),
      accounts: pendingFixed.map((a) => a.name)
    })
  }
  const monthEnded = current.closed || new Date(year, month, 0) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (monthEnded && plannedSave > 0 && saved < plannedSave) alerts.push({ level: 'warn', type: 'saving_short', amount: round(plannedSave - saved) })
  if (projection && projection.variablePlanned > 0 && projection.projectedVariable > projection.variablePlanned * 1.05) {
    alerts.push({ level: 'warn', type: 'pace', amount: round(projection.projectedVariable - projection.variablePlanned) })
  }

  // Saldo acumulado de los ahorros (saldo inicial + aportes de todos los meses).
  // Un ahorro archivado con saldo sigue contando: esa plata no desapareció.
  // Si la migración 0003 aún no se ejecutó, simplemente no se incluye.
  let savings = null
  const bal = await sb.from('account_balances').select('*')
  if (!bal.error) {
    const list = bal.data.filter((b) => !b.archived || Number(b.balance) !== 0).map((b) => ({ ...b, opening_balance: Number(b.opening_balance), contributed: Number(b.contributed), balance: Number(b.balance), withdrawn: Number(b.withdrawn ?? 0) }))
    savings = { total: round(list.reduce((t, b) => t + b.balance, 0)), accounts: list.sort((x, y) => y.balance - x.balance) }
  }

  return res.json({ month: current, kpis, byKind: k, accounts, history, alerts, projection, savings })
}
