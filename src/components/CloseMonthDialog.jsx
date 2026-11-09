import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import { friendlyError, MONTHS, money, parseAmount, periodLabel } from '../lib/format'
import { IconLock, IconPiggy } from './Icons'

const QUICK_FEES = [2, 3, 4, 6, 12]
const shift = ({ year, month }, k) => {
  const i = year * 12 + month - 1 + k
  return { year: Math.floor(i / 12), month: (i % 12) + 1 }
}

/**
 * Cierre de mes: muestra el sobrante (o déficit). Con sobrante, cuánto va a un
 * ahorro y cuánto pasa al mes siguiente. Con déficit, cómo se paga: se descuenta
 * el mes siguiente, en cuotas (gasto fijo) o el mes siguiente parte sin deuda.
 */
export default function CloseMonthDialog({ available, savingsAccounts, onClose, onDone }) {
  const { period, currency, notify } = useApp()
  const surplus = Math.max(available, 0)
  const [accountId, setAccountId] = useState(savingsAccounts[0]?.id ?? '')
  const [toSavings, setToSavings] = useState(surplus > 0 && savingsAccounts.length ? String(surplus) : '0')
  const [busy, setBusy] = useState(false)
  const deficit = available < 0 ? -available : 0
  const [debt, setDebt] = useState('carry')
  const [fees, setFees] = useState('3')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const amount = Math.min(parseAmount(toSavings), surplus)
  const n = Math.min(Math.max(parseInt(fees, 10) || 0, 0), 60)
  const fee = n > 0 ? Math.round((deficit / n) * 100) / 100 : 0
  const next = shift(period, 1)
  const last = shift(period, n)
  const carry = deficit > 0 && debt !== 'carry' ? 0 : available - amount
  const feeRange = n <= 1 ? MONTHS[next.month - 1] : last.year !== next.year ? `${periodLabel(next)} a ${periodLabel(last)}` : `${MONTHS[next.month - 1]} a ${MONTHS[last.month - 1]}`

  async function confirm() {
    setBusy(true)
    try {
      const body = { ...period, savingsAccountId: amount > 0 ? accountId : null, toSavings: amount }
      if (deficit > 0) Object.assign(body, { debt, installments: debt === 'installments' ? n : undefined })
      const r = await api('/months/close', { method: 'POST', body })
      notify(r.debt ? `${periodLabel(period)} cerrado · "${r.debt.name}" en ${r.debt.installments} ${r.debt.installments === 1 ? 'cuota' : 'cuotas'}` : `${periodLabel(period)} cerrado`)
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
              <p className="muted" style={{ fontSize: 14 }}>No tienes categorías de ahorro: todo lo que sobró pasará al mes siguiente. Puedes crear una en Presupuesto.</p>
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
        ) : deficit > 0 ? (
          <div className="stack" style={{ gap: 10, marginTop: 18 }}>
            <span className="label">¿Cómo lo vas a pagar?</span>
            <button type="button" className={`choice ${debt === 'carry' ? 'on' : ''}`} onClick={() => setDebt('carry')}>
              <span className="choice-dot" />
              <span><b>Lo descuento el próximo mes</b><small><span style={{ textTransform: 'capitalize' }}>{MONTHS[next.month - 1]}</span> parte con −{money(deficit, currency)}.</small></span>
            </button>
            <button type="button" className={`choice ${debt === 'installments' ? 'on' : ''}`} onClick={() => setDebt('installments')}>
              <span className="choice-dot" />
              <span><b>Lo pago en cuotas</b><small>Se crea el gasto fijo “Crédito {periodLabel(period)}” y aparece solo en los meses de las cuotas.</small></span>
            </button>
            {debt === 'installments' && (
              <div className="debt-fees">
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {QUICK_FEES.map((q) => (
                    <button type="button" key={q} className={`chip ${n === q ? 'on' : ''}`} onClick={() => setFees(String(q))}>{q}</button>
                  ))}
                  <input className="input input-sm" style={{ width: 72 }} inputMode="numeric" value={fees} onChange={(e) => setFees(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Número de cuotas" />
                  <span className="muted" style={{ fontSize: 13 }}>cuotas</span>
                </div>
                {n > 0 ? (
                  <p className="num" style={{ margin: 0, fontSize: 14 }}><b>{n} {n === 1 ? 'cuota' : 'cuotas'} de {money(fee, currency)}</b> <span className="muted">· {feeRange}</span></p>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>Indica en cuántas cuotas (1 a 60).</p>
                )}
              </div>
            )}
            <button type="button" className={`choice ${debt === 'forgive' ? 'on' : ''}`} onClick={() => setDebt('forgive')}>
              <span className="choice-dot" />
              <span><b>Empezar sin deuda</b><small>Ya lo cubrí por fuera (tarjeta, préstamo que llevo aparte).</small></span>
            </button>
            {debt === 'forgive' && <p className="debt-warn">La app no te va a recordar esta deuda. Si la vas pagando, anótala como gasto fijo para que se descuente.</p>}
          </div>
        ) : null}

        <div className="list" style={{ marginTop: 18 }}>
          {amount > 0 && (
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="row"><IconPiggy size={16} /> Va al ahorro</span>
              <b className="num">{money(amount, currency)}</b>
            </div>
          )}
          {deficit > 0 && debt === 'installments' ? (
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Cuota mensual{n > 1 ? ` (${n} meses)` : ''}</span>
              <b className="num">{n > 0 ? `−${money(fee, currency)}` : '—'}</b>
            </div>
          ) : (
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>{carry >= 0 ? 'Pasa al mes siguiente' : 'Se descuenta del mes siguiente'}</span>
              <b className="num" style={{ color: carry < 0 ? 'var(--danger)' : 'var(--text)' }}>{carry < 0 ? '−' : '+'}{money(Math.abs(carry), currency)}</b>
            </div>
          )}
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>El mes quedará en solo lectura. Puedes reabrirlo después si necesitas corregir algo.</p>

        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn dc-cta" onClick={confirm} disabled={busy || (amount > 0 && !accountId) || (deficit > 0 && debt === 'installments' && !(n >= 1))}>
            <IconLock size={16} /> {busy ? 'Cerrando…' : 'Cerrar mes'}
          </button>
        </div>
      </div>
    </div>
  )
}
