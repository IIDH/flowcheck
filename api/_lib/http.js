import { timingSafeEqual } from 'node:crypto'

/**
 * Responde un error sin filtrar detalles internos de la base al cliente.
 * Los errores de negocio lanzados a propósito (P0001, ej. "El mes está cerrado")
 * sí se muestran porque están pensados para el usuario.
 */
export function serverError(res, err, status = 500) {
  if (err?.code === 'P0001') return res.status(400).json({ error: err.message })
  console.error('[api]', err?.code || '', err?.message || err)
  return res.status(status).json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' })
}

/**
 * Límite de peticiones por usuario (ventana fija, guardado en Supabase para que
 * funcione entre instancias serverless). Si la función aún no existe en la base,
 * deja pasar y lo registra.
 */
export async function rateLimit(sb, res, bucket, max, windowSeconds) {
  const { data, error } = await sb.rpc('hit_rate_limit', { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds })
  if (error) {
    console.error('[rate-limit]', error.code, error.message)
    return true
  }
  if (data === false) {
    res.setHeader('Retry-After', String(windowSeconds))
    res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    return false
  }
  return true
}

/** Compara secretos en tiempo constante. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && timingSafeEqual(x, y)
}
