import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { friendlyError } from '../lib/format'
import { supabase } from '../lib/supabase'
import { Logo } from './Layout'

/** Pantalla para definir la nueva contraseña tras abrir el enlace de recuperación. */
export default function NewPassword() {
  const { notify, endRecovery } = useApp()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (password.length < 8) return notify('La contraseña debe tener al menos 8 caracteres', 'error')
    if (password !== confirm) return notify('Las contraseñas no coinciden', 'error')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    notify('Contraseña actualizada')
    endRecovery()
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card dc-rise">
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}><Logo /></div>
        <form className="card dc-current" style={{ padding: 32 }} onSubmit={submit} noValidate>
          <span className="pill dc-mono"><span className="pill-dot" />Recuperar acceso</span>
          <h1 style={{ fontSize: 26, marginTop: 16 }}>Crea tu nueva contraseña</h1>
          <div className="stack" style={{ gap: 14, marginTop: 20 }}>
            <label className="field">
              <span className="label">Nueva contraseña</span>
              <input className="input" type="password" required minLength={8} maxLength={72} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Repítela</span>
              <input className="input" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button className="btn dc-cta btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
