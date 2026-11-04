import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { openMonth } from '../lib/api'
import { friendlyError, money, parseAmount, periodLabel } from '../lib/format'
import { supabase } from '../lib/supabase'
import { IconArrow, IconCalendar } from './Icons'

/** Mes sin presupuesto: lo crea copiando el del último mes (con el sueldo que indiques). */
export default function EmptyMonth({ onOpened, hasAccounts = true }) {
  const { period, notify, currency } = useApp()
  const [income, setIncome] = useState('')
  const [prev, setPrev] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('months')
      .select('*')
      .or(`year.lt.${period.year},and(year.eq.${period.year},month.lt.${period.month})`)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPrev(data ?? null))
  }, [period.year, period.month])

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await openMonth(period, income.trim() === '' ? undefined : parseAmount(income))
      notify(r.copiedFrom ? 'Listo: partimos con el presupuesto del mes anterior' : 'Presupuesto del mes creado')
      onOpened?.(r.month)
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!hasAccounts) {
    return (
      <div className="card empty dc-current" style={{ maxWidth: 520, margin: '24px auto' }}>
        <div className="empty-icon"><IconCalendar size={26} /></div>
        <h2 style={{ fontSize: 22 }}>Aún no armas tu presupuesto</h2>
        <p className="lead" style={{ margin: '10px auto 22px' }}>Toma un minuto: tu sueldo y en qué gastas.</p>
        <Link to="/" className="btn dc-cta">Empezar <IconArrow className="arrow" size={16} /></Link>
      </div>
    )
  }

  return (
    <div className="card empty dc-current" style={{ maxWidth: 520, margin: '24px auto' }}>
      <div className="empty-icon"><IconCalendar size={26} /></div>
      <h2 style={{ fontSize: 22, textTransform: 'none' }}>Empecemos {periodLabel(period)}</h2>
      <p className="lead" style={{ margin: '10px auto 22px' }}>
        {prev ? <>Copiamos el presupuesto de {periodLabel(prev)} para que no partas de cero. ¿Cambió tu sueldo?</> : <>¿Cuánto ganas este mes?</>}
      </p>
      <form onSubmit={create} className="row" style={{ maxWidth: 420, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
        <input
          className="input input-money"
          style={{ flex: '1 1 180px' }}
          inputMode="decimal"
          placeholder={prev ? `Igual: ${money(prev.income, currency)}` : 'Tu sueldo del mes'}
          value={income}
          onChange={(e) => setIncome(e.target.value)}
          aria-label="Sueldo del mes"
        />
        <button className="btn dc-cta" disabled={busy}>
          {busy ? 'Creando…' : `Empezar ${periodLabel(period).split(' ')[0]}`} <IconArrow className="arrow" size={16} />
        </button>
      </form>
    </div>
  )
}
