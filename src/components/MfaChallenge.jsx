import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { Logo } from './Layout'

/** Segundo paso del login cuando el usuario activó la verificación en dos pasos. */
export default function MfaChallenge({ onVerified }) {
  const { notify } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      const factor = data.totp.find((f) => f.status === 'verified')
      if (!factor) throw new Error('No se encontró el factor de verificación')
      const v = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
      if (v.error) throw v.error
      onVerified()
    } catch (err) {
      notify(/invalid|expired/i.test(err.message) ? 'Código incorrecto o vencido' : friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card dc-rise">
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}><Logo /></div>
        <form className="card dc-current" style={{ padding: 32 }} onSubmit={submit}>
          <span className="pill dc-mono"><span className="pill-dot" />Verificación en dos pasos</span>
          <h1 style={{ fontSize: 26, marginTop: 16 }}>Ingresa tu código</h1>
          <p className="lead" style={{ fontSize: 15, marginBottom: 20 }}>Abre tu app de autenticación (Google Authenticator, 1Password, Authy…) y escribe el código de 6 dígitos de Flowcheck.</p>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ fontSize: 26, height: 58, textAlign: 'center', letterSpacing: '0.4em', fontFamily: 'var(--font-mono)' }}
          />
          <button className="btn dc-cta btn-block" style={{ marginTop: 16 }} disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Verificar'}</button>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => supabase.auth.signOut()}>Usar otra cuenta</button>
        </form>
      </div>
    </div>
  )
}
