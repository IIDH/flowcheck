/**
 * Cifras del mes, calculadas en un solo lugar para que todas las pantallas
 * muestren lo mismo.
 *
 * - Plata del mes: sueldo + otros ingresos (abonos, transferencias, bonos)
 *   + lo que pasó del mes anterior + lo retirado de ahorros.
 * - Te queda para gastar: plata del mes − lo gastado − lo ahorrado − lo que
 *   falta pagar de los gastos fijos − lo que falta para la meta de ahorro.
 *   De eso, una parte está reservada en tus categorías variables (súper,
 *   transporte…) y el resto es plata libre, sin categoría.
 */
export function monthFigures({ income = 0, carryIn = 0, rows = [] }) {
  const n = (v) => Number(v) || 0
  const group = (kind) => {
    const list = rows.filter((r) => r.kind === kind && !r.is_free)
    return {
      list,
      planned: list.reduce((s, r) => s + n(r.planned), 0),
      actual: list.reduce((s, r) => s + n(r.actual), 0),
      left: list.reduce((s, r) => s + Math.max(n(r.planned) - n(r.actual), 0), 0),
      over: list.reduce((s, r) => s + Math.max(n(r.actual) - n(r.planned), 0), 0)
    }
  }
  const fijo = group('fijo')
  const variable = group('variable')
  const ahorro = group('ahorro')

  const salary = n(income)
  const extra = rows.filter((r) => r.kind === 'ingreso').reduce((s, r) => s + n(r.actual), 0)
  const withdrawn = rows.reduce((s, r) => s + n(r.withdrawn), 0)
  const carry = n(carryIn)
  const totalIncome = salary + extra + carry + withdrawn

  const freeSpent = rows.filter((r) => r.is_free).reduce((s, r) => s + n(r.actual), 0)
  const spent = fijo.actual + variable.actual + freeSpent
  const saved = ahorro.actual
  const planned = fijo.planned + variable.planned + ahorro.planned

  const canSpend = totalIncome - spent - saved - fijo.left - ahorro.left
  const free = canSpend - variable.left

  return {
    salary,
    extra,
    carryIn: carry,
    withdrawn,
    totalIncome,
    fijo,
    variable,
    ahorro,
    freeSpent,
    spent,
    saved,
    planned,
    unassigned: totalIncome - planned,
    canSpend,
    free
  }
}

/** Días que quedan del mes (contando hoy) si el periodo es el mes en curso. */
export function daysLeftIn({ year, month }, today = new Date()) {
  if (today.getFullYear() !== year || today.getMonth() + 1 !== month) return null
  return new Date(year, month, 0).getDate() - today.getDate() + 1
}
