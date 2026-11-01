import { useEffect, useRef } from 'react'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
export const captchaEnabled = Boolean(SITE_KEY)

/**
 * Cloudflare Turnstile (anti-bots en registro / login / recuperación).
 * Solo se activa si existe VITE_TURNSTILE_SITE_KEY y Supabase tiene la
 * protección de bots activada con la clave secreta correspondiente.
 */
export default function Captcha({ onToken, resetKey }) {
  const ref = useRef(null)
  const cb = useRef(onToken)
  cb.current = onToken

  useEffect(() => {
    if (!SITE_KEY) return
    let widgetId
    const render = () => {
      if (!ref.current || !window.turnstile) return
      widgetId = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        theme: 'auto',
        language: 'es',
        callback: (t) => cb.current(t),
        'expired-callback': () => cb.current(null),
        'error-callback': () => cb.current(null)
      })
    }
    if (window.turnstile) render()
    else {
      let s = document.querySelector('script[data-turnstile]')
      if (!s) {
        s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.dataset.turnstile = '1'
        document.head.appendChild(s)
      }
      s.addEventListener('load', render, { once: true })
    }
    return () => {
      cb.current(null)
      if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [resetKey])

  if (!SITE_KEY) return null
  return <div ref={ref} style={{ minHeight: 65 }} />
}
