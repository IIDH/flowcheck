/*
 * Instalación de la PWA según navegador y dispositivo.
 *
 * Por qué existe: en Android cada navegador arma su propio paquete (WebAPK)
 * al instalar una PWA. Solo Chrome lo genera firmado por Google con un
 * targetSdk al día; Samsung Internet, Edge, Opera, Firefox y otros generan
 * paquetes "para una versión anterior de Android" que Android 14+ advierte o
 * bloquea. No depende de nuestra app, así que guiamos a instalar desde Chrome.
 *
 * Para que no se rompa con navegadores o celulares nuevos, Chrome se
 * reconoce por lista blanca: cualquier otro navegador de Android, conocido o
 * no, recibe la guía para abrir en Chrome.
 */

let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Siempre lo guardamos y mostramos nuestro propio botón (o la guía a Chrome)
    e.preventDefault()
    deferred = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function subscribeInstall(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '')

export function isInstalled() {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: minimal-ui)').matches || window.navigator.standalone)
}

const IN_APP = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/WhatsApp/i, 'WhatsApp'],
  [/TikTok|musical_ly|BytedanceWebview/i, 'TikTok'],
  [/Line\//i, 'LINE'],
  [/Twitter|XWebView/i, 'X'],
  [/Snapchat/i, 'Snapchat'],
  [/GSA\//i, 'la app de Google']
]

const ANDROID_BROWSERS = [
  [/SamsungBrowser/i, 'Samsung Internet'],
  [/EdgA/i, 'Edge'],
  [/OPR|Opera|OPX/i, 'Opera'],
  [/Firefox|FxiOS/i, 'Firefox'],
  [/YaBrowser/i, 'Yandex'],
  [/MiuiBrowser|XiaoMi/i, 'el navegador de Xiaomi'],
  [/HuaweiBrowser|HuaweiBrowser/i, 'el navegador de Huawei'],
  [/HeyTapBrowser|OppoBrowser/i, 'el navegador de Oppo'],
  [/VivoBrowser/i, 'el navegador de Vivo'],
  [/UCBrowser/i, 'UC Browser'],
  [/DuckDuckGo/i, 'DuckDuckGo']
]

/** ¿Es Chrome de Google en Android? (lista blanca: lo demás va a la guía de Chrome) */
function isGoogleChromeAndroid() {
  const brands = navigator.userAgentData?.brands
  if (brands?.length) return brands.some((b) => b.brand === 'Google Chrome')
  const s = ua()
  if (!/Chrome\/\d+/.test(s) || / wv\)/.test(s)) return false
  if (navigator.brave) return false
  return !ANDROID_BROWSERS.some(([re]) => re.test(s))
}

/**
 * Qué debe ver el usuario para instalar:
 * installed · prompt (botón nativo) · chrome-menu · other-android · in-app ·
 * ios-safari · ios-other · desktop-manual
 */
export function installPlan() {
  if (typeof navigator === 'undefined') return { kind: 'desktop-manual' }
  if (isInstalled()) return { kind: 'installed' }
  const s = ua()
  const android = /Android/i.test(s)
  const ios = /iPhone|iPad|iPod/i.test(s) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const inApp = IN_APP.find(([re]) => re.test(s))
  if (inApp || (android && / wv\)/.test(s))) return { kind: 'in-app', app: inApp?.[1] ?? 'otra app', android, ios }

  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(s) ? { kind: 'ios-other' } : { kind: 'ios-safari' }

  if (android) {
    if (!isGoogleChromeAndroid()) {
      const known = ANDROID_BROWSERS.find(([re]) => re.test(s))
      return { kind: 'other-android', browser: navigator.brave ? 'Brave' : (known?.[1] ?? 'este navegador') }
    }
    return deferred ? { kind: 'prompt' } : { kind: 'chrome-menu' }
  }

  return deferred ? { kind: 'prompt' } : { kind: 'desktop-manual' }
}

/** Muestra el diálogo nativo de instalación (Chrome / Edge de escritorio). */
export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}

/** Enlace que abre esta misma página en Chrome (o en la Play Store si no lo tiene). */
export function chromeIntentUrl() {
  const { host, pathname, search } = window.location
  const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome')
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
}

export const CHROME_STORE_URL = 'https://play.google.com/store/apps/details?id=com.android.chrome'

// Banner de instalación descartado: se vuelve a mostrar a las 2 semanas
const DISMISS_KEY = 'fa-install-dismissed'
export function installDismissed() {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 14 * 864e5
  } catch {
    return false
  }
}
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {}
}
