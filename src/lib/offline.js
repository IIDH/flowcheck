import { supabase } from './supabase'

// ---------------------------------------------------------------- caché de lecturas
// Últimos datos vistos (cuentas, mes, movimientos, dashboard) para poder abrir
// la app sin conexión. Vive solo en este dispositivo.
const CACHE_PREFIX = 'fa-cache:'

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function cacheSet(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {}
}

export function cacheClear({ keepOutbox = false } = {}) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX) || (!keepOutbox && k === OUTBOX_KEY)).forEach((k) => localStorage.removeItem(k))
  } catch {}
}

export const isNetworkError = (err) =>
  !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(err?.message || String(err || ''))

// ---------------------------------------------------------------- cola de movimientos
// Los movimientos registrados sin conexión se guardan aquí con un id generado en
// el cliente; al sincronizar se insertan con upsert por id, así un reintento
// nunca los duplica.
const OUTBOX_KEY = 'fa-outbox'
const listeners = new Set()

export function getOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
  } catch {
    return []
  }
}

function writeOutbox(list) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list))
  } catch {}
  listeners.forEach((fn) => fn(list))
}

export function subscribeOutbox(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** item: fila de transactions (con id) + datos de la cuenta para mostrarla mientras está pendiente. */
export function enqueue(item) {
  writeOutbox([...getOutbox(), { ...item, queued_at: new Date().toISOString() }])
}

export function dropQueued(id) {
  writeOutbox(getOutbox().filter((t) => t.id !== id))
}

let flushing = null
export function flushOutbox() {
  if (flushing) return flushing
  flushing = (async () => {
    const result = { synced: 0, failed: [] }
    for (const item of getOutbox()) {
      if (!navigator.onLine) break
      const { id, month_id, account_id, amount, occurred_on, description } = item
      const { error } = await supabase
        .from('transactions')
        .upsert({ id, month_id, account_id, amount, occurred_on, description }, { onConflict: 'id', ignoreDuplicates: true })
      if (!error) {
        dropQueued(id)
        result.synced++
      } else if (isNetworkError(error)) {
        break
      } else {
        // Error definitivo (p. ej. el mes se cerró): se descarta y se informa.
        dropQueued(id)
        result.failed.push({ item, error: error.message })
      }
    }
    if (result.synced) window.dispatchEvent(new CustomEvent('fa-synced', { detail: result }))
    return result
  })().finally(() => {
    flushing = null
  })
  return flushing
}
