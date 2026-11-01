import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useConfirm } from './ConfirmDialog'
import { todayISO } from '../lib/api'
import { friendlyError, money, parseAmount } from '../lib/format'
import { supabase } from '../lib/supabase'
import { IconAlert } from './Icons'

const REASONS = ['Emergencia médica', 'Reparación', 'Gasto imprevisto', 'Cumplí la meta', 'Viaje']

/**
 * Retiro desde una cuenta de ahorro. Pide motivo obligatorio para dejar historia.
 * La plata retirada queda en el mes como saldo libre para registrar el gasto.
 */
export default function WithdrawDialog({ account, balance, onClose, onDone }) {
  const { currency, notify } = useApp()
  const confirm = useConfirm()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const value = parseAmount(amount)
  const after = balance - value

  async function submit(e) {
    e.preventDefault()
    if (!(value > 0)) return notify('Ingresa el monto a retirar', 'error')
    if (reason.trim().length < 3) return notify('Cuéntanos el motivo del retiro', 'error')
    if (!date) return notify('Elige la fecha del retiro', 'error')
    if (date > todayISO()) return notify('La fecha del retiro no puede ser futura', 'error')
    if (value > balance && !(await confirm({ tone: 'warn', title: 'El retiro supera el saldo', message: <><b>{account.name}</b> tiene {money(balance, currency)} registrados y quieres retirar {money(value, currency)}. ¿Continuar igual?</>, confirmText: 'Retirar igual' }))) return
    setBusy(true)
    try {
      const [y, m] = date.split('-').map(Number)
      const month = await supabase.from('months').select('id, closed').eq('year', y).eq('month', m).maybeSingle()
      if (month.error) throw month.error
      if (!month.data) throw new Error('Ese mes aún no tiene imagen. Créala primero en Mi mes.')
      if (month.data.closed) throw new Error('Ese mes está cerrado. Reábrelo para registrar el retiro.')
      const { error } = await supabase.from('transactions').insert({
        month_id: month.data.id,
        account_id: account.id,
        amount: value,
        occurred_on: date,
        kind: 'retiro',
        description: reason.trim()
      })
      if (error) throw error
      notify(`Retiraste ${money(value, currency)} de ${account.name}`)
      onDone()
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal card dc-rise" role="dialog" aria-modal="true" aria-labelledby="wd-title" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <span className="pill dc-mono"><span className="pill-dot" />Retiro de ahorro</span>
        <h2 id="wd-title" style={{ fontSize: 24, marginTop: 14 }}>{account.name}</h2>
        <p className="muted num" style={{ marginTop: 6, fontSize: 14 }}>Saldo actual: <b style={{ color: 'var(--text)' }}>{money(balance, currency)}</b></p>

        <div className="stack" style={{ gap: 14, marginTop: 18 }}>
          <label className="field">
            <span className="label">Monto a retirar</span>
            <input className="input input-money" inputMode="decimal" placeholder="0" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 22, height: 54, fontFamily: 'var(--font-display)', fontWeight: 600 }} />
          </label>
          <label className="field">
            <span className="label">¿Por qué sacas esta plata?</span>
            <textarea className="input" rows={3} maxLength={140} required placeholder="Ej: se echó a perder el refrigerador" value={reason} onChange={(e) => setReason(e.target.value)} style={{ height: 'auto', padding: '12px 14px', resize: 'vertical', lineHeight: 1.4 }} />
          </label>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {REASONS.map((r) => (
              <button type="button" key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r}</button>
            ))}
          </div>
          <label className="field">
            <span className="label">Fecha</span>
            <input type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        <div className="list" style={{ marginTop: 16 }}>
          <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
            <span>Saldo después del retiro</span>
            <b className="num" style={{ color: after < 0 ? 'var(--danger)' : 'var(--text)' }}>{money(after, currency)}</b>
          </div>
        </div>
        {after < 0 && (
          <div className="alert alert-warn" style={{ marginTop: 10 }}><IconAlert size={18} /><div>El retiro supera el saldo registrado de esta cuenta.</div></div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          La plata retirada queda disponible en el mes como <b>saldo libre</b>: registra el gasto en Movimientos eligiendo "Saldo libre" (o la cuenta que corresponda).
        </p>

        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-danger" disabled={busy}>{busy ? 'Registrando…' : 'Registrar retiro'}</button>
        </div>
      </form>
    </div>
  )
}
