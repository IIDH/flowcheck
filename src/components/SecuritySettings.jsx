import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useConfirm } from './ConfirmDialog'
import { api } from '../lib/api'
import { friendlyError, money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { IconAlert, IconDownload, IconLock, IconTrash } from './Icons'

// ------------------------------------------------------------ verificación en dos pasos
export function MfaCard() {
  const { notify } = useApp()
  const confirm = useConfirm()
  const [factor, setFactor] = useState(undefined)
  const [enroll, setEnroll] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    setFactor(error ? null : data.totp.find((f) => f.status === 'verified') ?? null)
  }, [])
  useEffect(() => { load() }, [load])

  async function start() {
    setBusy(true)
    // Limpia intentos anteriores sin verificar
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of list?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Flowcheck ${Date.now()}` })
    setBusy(false)
    if (error) return notify(/disabled|not enabled/i.test(error.message) ? 'La verificación en dos pasos no está habilitada en Supabase.' : friendlyError(error), 'error')
    setEnroll(data)
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() })
    setBusy(false)
    if (error) return notify('Código incorrecto. Revisa que la hora de tu teléfono esté sincronizada.', 'error')
    notify('Verificación en dos pasos activada')
    setEnroll(null)
    setCode('')
    load()
  }

  async function disable() {
    if (!(await confirm({ tone: 'warn', title: '¿Desactivar la verificación en dos pasos?', message: 'Tu cuenta quedará protegida solo con la contraseña.', confirmText: 'Desactivar' }))) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) return notify(friendlyError(error), 'error')
    notify('Verificación en dos pasos desactivada')
    load()
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Verificación en dos pasos</h3>
          <p className="card-sub">Además de tu contraseña, pide un código de tu teléfono al ingresar.</p>
        </div>
        {factor !== undefined && <span className={`badge ${factor ? 'badge-ok' : ''}`}><IconLock size={11} /> {factor ? 'Activa' : 'Inactiva'}</span>}
      </div>
      {factor ? (
        <button className="btn btn-ghost btn-sm" onClick={disable}>Desactivar</button>
      ) : enroll ? (
        <form onSubmit={verify} className="stack" style={{ gap: 12 }}>
          <p style={{ fontSize: 14 }}>1. Escanea este código con tu app de autenticación (Google Authenticator, 1Password, Authy…).</p>
          <img src={enroll.totp.qr_code} alt="Código QR para la app de autenticación" width={180} height={180} style={{ background: '#fff', borderRadius: 12, padding: 8 }} />
          <p className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>¿No puedes escanear? Ingresa esta clave: <code>{enroll.totp.secret}</code></p>
          <p style={{ fontSize: 14 }}>2. Escribe el código de 6 dígitos que aparece:</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 160, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'var(--font-mono)' }} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" />
            <button className="btn dc-cta" disabled={busy || code.length !== 6}>Activar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEnroll(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button className="btn dc-cta btn-sm" onClick={start} disabled={busy || factor === undefined}>Activar verificación en dos pasos</button>
      )}
    </div>
  )
}

// ------------------------------------------------------------ mis datos: exportar y eliminar
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  // Evita inyección de fórmulas al abrir el CSV en Excel/Sheets
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function DataCard() {
  const { user, notify } = useApp()
  const [busy, setBusy] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function exportData() {
    setBusy(true)
    try {
      const tables = ['profiles', 'accounts', 'months', 'budget_items', 'transactions', 'budget_moves']
      const results = await Promise.all(tables.map((t) => supabase.from(t).select('*')))
      // budget_moves es opcional (puede no existir si aún no se corre la migración 0008)
      const failed = results.find((r, i) => r.error && tables[i] !== 'budget_moves')
      if (failed) throw failed.error
      const data = Object.fromEntries(tables.map((t, i) => [t, results[i].data]))
      const stamp = new Date().toISOString().slice(0, 10)
      download(`flowcheck-datos-${stamp}.json`, JSON.stringify({ exportado: new Date().toISOString(), email: user.email, ...data }, null, 2), 'application/json')

      const accName = Object.fromEntries(data.accounts.map((a) => [a.id, a]))
      const header = ['fecha', 'cuenta', 'tipo_cuenta', 'tipo_movimiento', 'monto', 'detalle']
      const rows = data.transactions
        .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
        .map((t) => [t.occurred_on, accName[t.account_id]?.name, accName[t.account_id]?.kind, t.kind ?? 'normal', t.amount, t.description])
      download(`flowcheck-movimientos-${stamp}.csv`, '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
      notify('Datos exportados')
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setBusy(true)
    try {
      await api('/account/delete', { method: 'POST', body: { confirm: confirmText } })
      await supabase.auth.signOut()
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3 className="card-title">Mis datos</h3>
      <p className="card-sub" style={{ marginBottom: 16 }}>Descarga todo lo que has registrado o elimina tu cuenta definitivamente.</p>
      <button className="btn btn-ghost btn-sm" onClick={exportData} disabled={busy}><IconDownload size={14} /> Exportar mis datos (JSON + CSV)</button>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        {!deleting ? (
          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}><IconTrash size={14} /> Eliminar mi cuenta</button>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <div className="alert alert-danger"><IconAlert size={18} /><div>Se borrarán <b>para siempre</b> tu cuenta, tus cuentas, meses, movimientos, ahorros e historial. Te recomendamos exportar tus datos antes.</div></div>
            <label className="field">
              <span className="label">Escribe ELIMINAR para confirmar</span>
              <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </label>
            <div className="row">
              <button className="btn btn-danger" disabled={busy || confirmText !== 'ELIMINAR'} onClick={deleteAccount}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
              <button className="btn btn-ghost" onClick={() => { setDeleting(false); setConfirmText('') }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ actividad reciente (audit_log)
const ACTION_LABEL = { retiro: 'Retiro de ahorro', eliminar: 'Eliminado', cerrar: 'Mes cerrado', reabrir: 'Mes reabierto', archivar: 'Cuenta archivada', reactivar: 'Cuenta reactivada' }
const ENTITY_LABEL = { transaction: 'movimiento', month: 'mes', account: 'cuenta' }

export function ActivityCard() {
  const { currency } = useApp()
  const [items, setItems] = useState(null)

  useEffect(() => {
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(15)
      .then(({ data, error }) => setItems(error ? [] : data))
  }, [])

  const describe = (a) => {
    const d = a.detail || {}
    if (a.entity === 'month') return `${String(d.month).padStart(2, '0')}/${d.year}`
    if (a.entity === 'account') return d.name
    return [d.amount != null && money(d.amount, currency), d.motivo || d.detalle].filter(Boolean).join(' · ')
  }

  return (
    <div className="card">
      <h3 className="card-title">Actividad reciente</h3>
      <p className="card-sub" style={{ marginBottom: 10 }}>Registro de acciones importantes en tu cuenta.</p>
      {items === null ? (
        <div className="skeleton" style={{ height: 80 }} />
      ) : items.length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>Sin actividad registrada todavía.</p>
      ) : (
        <div className="list">
          {items.map((a) => (
            <div key={a.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>{ACTION_LABEL[a.action] ?? a.action}{a.action === 'eliminar' ? ` (${ENTITY_LABEL[a.entity] ?? a.entity})` : ''}</b>
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describe(a)}</div>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
