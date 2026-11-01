import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { openMonth } from '../lib/api'
import { friendlyError, parseAmount, periodLabel } from '../lib/format'
import { IconArrow, IconCalendar } from './Icons'

/** Mes sin "imagen": pide la renta y la crea copiando el plan anterior. */
export default function EmptyMonth({ onOpened, hasAccounts = true }) {
  const { period, notify } = useApp()
  const [income, setIncome] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await openMonth(period, income.trim() === '' ? undefined : parseAmount(income))
      notify(r.copiedFrom ? 'Imagen creada a partir del mes anterior' : 'Imagen del mes creada')
      onOpened?.(r.month)
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card empty dc-current" style={{ maxWidth: 560, margin: '24px auto' }}>
      <div className="empty-icon"><IconCalendar size={26} /></div>
      <h2 style={{ fontSize: 24 }}>Aún no hay imagen para {periodLabel(period)}</h2>
      <p className="lead" style={{ margin: '10px auto 24px' }}>
        Ingresa la renta del mes y Flowcheck arma tu plan: copia lo planificado el mes anterior y suma tus cuentas nuevas con su monto por defecto.
      </p>
      {!hasAccounts ? (
        <Link to="/cuentas" className="btn dc-cta">Primero crea tus cuentas <IconArrow className="arrow" size={16} /></Link>
      ) : (
        <form onSubmit={create} className="row" style={{ maxWidth: 400, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
          <input
            className="input input-money"
            style={{ flex: '1 1 180px' }}
            inputMode="decimal"
            placeholder="Renta del mes (opcional)"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            aria-label="Renta del mes"
          />
          <button className="btn dc-cta" disabled={busy}>
            {busy ? 'Creando…' : 'Crear imagen'} <IconArrow className="arrow" size={16} />
          </button>
        </form>
      )}
    </div>
  )
}
