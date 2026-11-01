import { supabase } from './supabase'

export const FREE_NAME = 'Saldo libre'
export const FREE_COLOR = '#5b6774'

/** Devuelve el id de la cuenta "Saldo libre" del usuario, creándola si no existe. */
export async function ensureFreeAccount(accounts) {
  const existing = accounts?.find((a) => a.is_free)
  if (existing) return existing.id
  const found = await supabase.from('accounts').select('id').eq('is_free', true).maybeSingle()
  if (found.error) throw found.error
  if (found.data) return found.data.id
  const created = await supabase
    .from('accounts')
    .insert({ name: FREE_NAME, kind: 'variable', is_free: true, color: FREE_COLOR, sort: 999 })
    .select('id')
    .single()
  if (created.error) throw created.error
  return created.data.id
}

/**
 * Saldo libre del mes: lo que quedó sin asignar en la imagen (renta + arrastre −
 * planificado) más lo retirado de ahorros, menos lo ya gastado desde él.
 */
export function freeBalance({ income = 0, carryIn = 0, rows = [] }) {
  const planned = rows.filter((r) => !r.is_free && r.kind !== 'ingreso').reduce((s, r) => s + r.planned, 0)
  const unassigned = Number(income) + carryIn - planned
  // Lo retirado de ahorros este mes también queda como saldo libre para gastar
  const withdrawn = rows.reduce((s, r) => s + (r.withdrawn || 0), 0)
  const used = rows.filter((r) => r.is_free).reduce((s, r) => s + r.actual, 0)
  const pool = unassigned + withdrawn
  return { unassigned, withdrawn, pool, used, left: pool - used }
}
