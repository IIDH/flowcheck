const round = (n) => Math.round(n * 100) / 100

/** Lo que llega desde el mes anterior registrado (su carry_out, si se cerró). */
export async function carryInFor(sb, { year, month }) {
  const prev = await sb
    .from('months')
    .select('*')
    .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prev.error) throw prev.error
  return prev.data?.closed ? Number(prev.data.carry_out ?? 0) : 0
}

/** Cifras reales del mes: ingresos, gastos, ahorro y disponible (incluye arrastre). */
export async function monthFigures(sb, monthRow) {
  const [rows, carryIn] = await Promise.all([
    sb.from('month_account_summary').select('*').eq('month_id', monthRow.id),
    carryInFor(sb, monthRow)
  ])
  if (rows.error) throw rows.error
  const sum = (kind, field) => rows.data.filter((r) => r.kind === kind).reduce((s, r) => s + Number(r[field]), 0)
  const renta = Number(monthRow.income)
  const extra = sum('ingreso', 'actual')
  const spent = sum('fijo', 'actual') + sum('variable', 'actual')
  const saved = sum('ahorro', 'actual')
  // Lo retirado de ahorros entra al mes como plata disponible
  const withdrawn = rows.data.reduce((s, r) => s + Number(r.withdrawn ?? 0), 0)
  return { renta, extra, carryIn, spent, saved, withdrawn, available: round(renta + extra + carryIn + withdrawn - spent - saved) }
}
