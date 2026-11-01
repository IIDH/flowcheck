import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Captcha, { captchaEnabled } from '../components/Captcha'
import { Logo } from '../components/Layout'
import { IconArrow } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export default function Login() {
  const { notify } = useApp()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  // Login con Google desactivado por ahora. Para activarlo: configurar el proveedor
  // en Supabase y definir VITE_ENABLE_GOOGLE=true. Aun así, solo se muestra si
  // Supabase lo reporta activo (si no, respondería un JSON de error).
  useEffect(() => {
    if (import.meta.env.VITE_ENABLE_GOOGLE !== 'true') return
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setGoogleEnabled(Boolean(s?.external?.google)))
      .catch(() => setGoogleEnabled(false))
  }, [])
  const [captchaToken, setCaptchaToken] = useState(null)
  const [captchaKey, setCaptchaKey] = useState(0)

  async function google() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
    })
    if (error) {
      setBusy(false)
      notify(/not enabled|unsupported provider/i.test(error.message) ? 'El login con Google aún no está habilitado en Supabase.' : friendlyError(error), 'error')
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return notify('Ingresa un email válido', 'error')
    if (mode !== 'reset' && password.length < 8) return notify('La contraseña debe tener al menos 8 caracteres', 'error')
    if (mode === 'signup' && !accepted) return notify('Debes aceptar los Términos y la Política de privacidad', 'error')
    if (captchaEnabled && !captchaToken) return notify('Completa la verificación anti-bots', 'error')
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name, terms_accepted_at: new Date().toISOString() }, emailRedirectTo: window.location.origin, captchaToken }
        })
        if (error) throw error
        if (!data.session) setSent(true)
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin, captchaToken })
        if (error) throw error
        setSent(true)
      }
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setBusy(false)
      // Cada token anti-bots sirve una sola vez
      if (captchaEnabled) setCaptchaKey((k) => k + 1)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="dc-glow" style={{ width: 520, height: 520, top: -200, right: -160, background: 'color-mix(in oklab, var(--primary) 22%, transparent)' }} />
      <div className="dc-glow" style={{ width: 380, height: 380, bottom: -160, left: -120, background: 'color-mix(in oklab, var(--primary-2) 16%, transparent)', animationDelay: '-8s' }} />

      <div className="auth-card dc-rise">
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}><Logo /></div>
        <div className="card dc-current" style={{ padding: 32 }}>
          <span className="pill dc-mono"><span className="pill-dot" />Finanzas personales</span>
          <h1 style={{ fontSize: 30, marginTop: 16, lineHeight: 1.15 }}>
            {mode === 'login' ? 'Bienvenido de vuelta' : mode === 'signup' ? 'Ordena tu mes en minutos' : 'Recupera tu acceso'}
          </h1>
          <p className="lead" style={{ fontSize: 15, marginBottom: 24 }}>
            Cuentas fijas, ahorro y lo que vas gastando, contra la imagen que planificaste.
          </p>

          {sent ? (
            <div className="alert alert-info">
              <div>Te enviamos un correo a <b>{email}</b>. {mode === 'signup' ? 'Confírmalo para entrar.' : 'Sigue el enlace para cambiar tu contraseña.'}</div>
            </div>
          ) : (
            <form onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
              {mode !== 'reset' && googleEnabled && (
                <>
                  <button type="button" className="btn btn-google dc-cta btn-block" onClick={google} disabled={busy}>
                    <GoogleIcon /> Continuar con Google
                  </button>
                  <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: -4 }}>Al continuar con Google aceptas los <Link to="/terminos" target="_blank" className="legal-link">Términos</Link> y la <Link to="/privacidad" target="_blank" className="legal-link">Privacidad</Link>.</p>
                  <div className="divider">o con tu email</div>
                </>
              )}
              {mode === 'signup' && (
                <label className="field">
                  <span className="label">Nombre</span>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
              )}
              <label className="field">
                <span className="label">Email</span>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              {mode !== 'reset' && (
                <label className="field">
                  <span className="label">Contraseña</span>
                  <input className="input" type="password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                  {mode === 'signup' && <span className="muted" style={{ fontSize: 12 }}>Mínimo 8 caracteres. Mejor una frase larga que no uses en otros sitios.</span>}
                </label>
              )}
              {mode === 'signup' && (
                <label className="row" style={{ alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.45, cursor: 'pointer' }}>
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--primary)' }} />
                  <span className="muted">Soy mayor de 18 años y acepto los <Link to="/terminos" target="_blank" className="legal-link">Términos</Link> y la <Link to="/privacidad" target="_blank" className="legal-link">Política de privacidad</Link>.</span>
                </label>
              )}
              <Captcha onToken={setCaptchaToken} resetKey={`${mode}-${captchaKey}`} />
              <button className="btn dc-cta btn-block" disabled={busy} style={{ marginTop: 6 }}>
                {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
                <IconArrow className="arrow" size={16} />
              </button>
            </form>
          )}

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 20, fontSize: 14, flexWrap: 'wrap' }}>
            {mode === 'login' ? (
              <>
                <button className="dc-nav-link" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => { setMode('signup'); setSent(false) }}>Crear cuenta</button>
                <button className="dc-nav-link" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => { setMode('reset'); setSent(false) }}>Olvidé mi contraseña</button>
              </>
            ) : (
              <button className="dc-nav-link" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => { setMode('login'); setSent(false) }}>← Ya tengo cuenta</button>
            )}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 18 }}>
          <Link to="/privacidad" className="legal-link">Privacidad</Link> · <Link to="/terminos" className="legal-link">Términos</Link>
        </p>
      </div>
    </div>
  )
}
