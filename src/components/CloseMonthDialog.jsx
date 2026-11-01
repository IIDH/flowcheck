import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import { friendlyError, money, parseAmount, periodLabel } from '../lib/format'
import { IconLock, IconPiggy } from './Icons'

/**
 * Cierre de mes: muestra el sobrante (o déficit) y deja elegir cuánto va a un
 * ahorro y cuánto pasa al mes siguiente.
 */
export default function CloseMonthDialog({ available, savingsAccounts, onClose, onDone }) {
  const { period, currency, notify } = useApp()
  const surplus = Math.max(available, 0)
  const [accountId, setAccountId] = useState(savingsAccounts[0]?.id ?? '')
  const [toSavings, setToSavings] = useState(surplus > 0 && savingsAccounts.length ? String(surplus) : '0')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const amount = Math.min(parseAmount(toSavings), surplus)
  const carry = available - amount

  async function confirm() {
    setBusy(true)
    try {
      await api('/months/close', { method: 'POST', body: { ...period, savingsAccountId: amount > 0 ? accountId : null, toSavings: amount } })
      notify(`${periodLabel(period)} cerrado`)
      onDone()
    } catch (err) {
      notify(friendlyError(err), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card dc-rise" role="dialog" aria-modal="true" aria-labelledby="close-title" onClick={(e) => e.stopPropagation()}>
        <span className="pill dc-mono"><span className="pill-dot" />Cierre de mes</span>
        <h2 id="close-title" style={{ fontSize: 24, marginTop: 14, textTransform: 'capitalize' }}>{periodLabel(period)}</h2>

        <div className="card-soft" style={{ marginTop: 18, textAlign: 'center' }}>
          <div className="dc-mono muted">{available >= 0 ? 'Te sobró' : 'Te faltó'}</div>
          <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 32, marginTop: 6, color: available >= 0 ? 'var(--text)' : 'var(--danger)' }}>
            {money(Math.abs(available), currency)}
          </div>
        </div>

        {available > 0 ? (
          <div className="stack" style={{ gap: 14, marginTop: 18 }}>
            {savingsAccounts.length === 0 ? (
              <p className="muted" style={{ fontSize: 14 }}>No tienes cuentas de ahorro: todo el sobrante pasará al mes siguiente. Puedes crear una en Cuentas.</p>
            ) : (
              <>
                <label className="field">
                  <span className="label">Mandar al ahorro</span>
                  <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {savingsAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Monto al ahorro</span>
                  <input className="input input-money" inputMode="decimal" value={toSavings} onChange={(e) => setToSavings(e.target.value)} onFocus={(e) => e.target.select()} />
                </label>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="chip" onClick={() => setToSavings(String(surplus))}>Todo al ahorro</button>
                  <button type="button" className="chip" onClick={() => setToSavings(String(Math.round(surplus / 2)))}>Mitad y mitad</button>
                  <button type="button" className="chip" onClick={() => setToSavings('0')}>Todo al mes siguiente</button>
                </div>
              </>
            )}
          </div>
        ) : null}

        <div className="list" style={{ marginTop: 18 }}>
          {amount > 0 && (
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="row"><IconPiggy size={16} /> Va al ahorro</span>
              <b className="num">{money(amount, currency)}</b>
            </div>
          )}
          <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
            <span>{carry >= 0 ? 'Pasa al mes siguiente' : 'Se descuenta del mes siguiente'}</span>
            <b className="num" style={{ color: carry < 0 ? 'var(--danger)' : 'var(--text)' }}>{carry < 0 ? '−' : '+'}{money(Math.abs(carry), currency)}</b>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>El mes quedará en solo lectura. Puedes reabrirlo después si necesitas corregir algo.</p>

        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn dc-cta" onClick={confirm} disabled={busy || (amount > 0 && !accountId)}>
            <IconLock size={16} /> {busy ? 'Cerrando…' : 'Cerrar mes'}
          </button>
        </div>
      </div>
    </div>
  )
}
