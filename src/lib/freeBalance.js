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

/** Nombre visible de la cuenta de sistema "Saldo libre". */
export const FREE_LABEL = 'Sin categoría'
