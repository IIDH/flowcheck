import webpush from 'web-push'

let configured = false
function configure() {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@flowcheck.app', pub, priv)
  configured = true
  return true
}

// Solo servicios push oficiales (evita SSRF: que el servidor haga peticiones a
// URLs arbitrarias guardadas por un usuario). Igual regla que la constraint en BD.
const ALLOWED_PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)$/

export function isAllowedPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.port && !u.username && !u.password && ALLOWED_PUSH_HOST.test(u.hostname) && endpoint.length <= 1000
  } catch {
    return false
  }
}

/**
 * Envía un payload a varias suscripciones. Devuelve cuántas llegaron y los ids
 * de suscripciones vencidas (404/410) o no permitidas, para que el llamador las borre.
 */
export async function sendPush(subscriptions, payload) {
  if (!configure()) throw new Error('Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el servidor')
  const body = JSON.stringify(payload)
  let sent = 0
  const gone = []
  await Promise.all(
    subscriptions.map(async (s) => {
      if (!isAllowedPushEndpoint(s.endpoint)) {
        gone.push(s.id)
        return
      }
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12 })
        sent++
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) gone.push(s.id)
        else console.error('push error', err.statusCode, err.body || err.message)
      }
    })
  )
  return { sent, gone }
}
