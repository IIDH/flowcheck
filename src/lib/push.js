import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY
// Mismos servicios push permitidos que valida el servidor y la base de datos
const ALLOWED_PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)$/

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(VAPID)

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('El service worker no está activo. Recarga la página e intenta de nuevo.')), 8000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await registration()
  return reg.pushManager.getSubscription()
}

/** Pide permiso, suscribe este dispositivo y lo guarda en Supabase. */
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('No diste permiso de notificaciones. Puedes habilitarlo desde la configuración del navegador.')
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID) })
  const json = sub.toJSON()
  if (!ALLOWED_PUSH_HOST.test(new URL(json.endpoint).hostname)) throw new Error('Este navegador usa un servicio de notificaciones no soportado.')
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'user_id,endpoint' })
  if (error) throw error
  return sub
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
