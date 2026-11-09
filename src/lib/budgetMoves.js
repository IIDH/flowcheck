import { supabase } from './supabase'

/**
 * Ajustes de presupuesto cuando un gasto fijo sale distinto a lo planeado.
 *
 * - exceso: te pasaste en la cuenta fija; la diferencia sale de otra categoría
 *   (o de la plata libre, other = null). La fija sube y la otra baja.
 * - sobrante: salió más barato; lo que sobró va a otra categoría (o a la plata
 *   libre). La fija baja y la otra sube.
 *
 * No es plata que entra o sale: solo mueve el presupuesto del mes. Cada ajuste
 * queda registrado en budget_moves para verlo en Gastos.
 */
const sign = (reason) => (reason === 'exceso' ? 1 : -1)

function shifted(plan, move, direction) {
  const s = sign(move.reason) * direction * Number(move.amount)
  const out = { [move.account_id]: Math.max((plan[move.account_id] ?? 0) + s, 0) }
  if (move.other_account_id) out[move.other_account_id] = Math.max((plan[move.other_account_id] ?? 0) - s, 0)
  return out
}

async function savePlan(monthId, changes) {
  const rows = Object.entries(changes).map(([account_id, planned]) => ({ month_id: monthId, account_id, planned }))
  return supabase.from('budget_items').upsert(rows, { onConflict: 'month_id,account_id' })
}

/** Aplica un ajuste. `plan` = { account_id: planned } del mes. */
export async function applyMove({ plan, ...move }) {
  const up = await savePlan(move.month_id, shifted(plan, move, 1))
  if (up.error) return { error: up.error }
  const log = await supabase.from('budget_moves').insert(move)
  return { error: null, logError: log.error }
}

/** Deshace ajustes (al borrar el gasto que los originó o el ajuste mismo). */
export async function revertMoves(moves) {
  for (const move of moves) {
    const cur = await supabase.from('budget_items').select('account_id, planned').eq('month_id', move.month_id)
    if (cur.error) return { error: cur.error }
    const plan = Object.fromEntries((cur.data ?? []).map((r) => [r.account_id, Number(r.planned)]))
    const up = await savePlan(move.month_id, shifted(plan, move, -1))
    if (up.error) return { error: up.error }
    const del = await supabase.from('budget_moves').delete().eq('id', move.id)
    if (del.error) return { error: del.error }
  }
  return { error: null }
}

/** Ajustes ligados a un gasto (vacío si la tabla aún no existe). */
export async function movesOf(transactionId) {
  const r = await supabase.from('budget_moves').select('*').eq('transaction_id', transactionId)
  return r.error ? [] : (r.data ?? [])
}

/** Texto del ajuste: "Gasto por exceso en Luz" / "Abono por diferencia en Internet". */
export function moveLabel(move, nameOf) {
  const fixed = nameOf(move.account_id)
  const other = nameOf(move.other_account_id)
  return move.reason === 'exceso'
    ? { title: `Gasto por exceso en ${fixed}`, detail: `Cubierto con ${other}`, plus: false }
    : { title: `Abono por diferencia en ${fixed}`, detail: `Pasó a ${other}`, plus: true }
}
