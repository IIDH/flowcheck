import { useApp } from '../context/AppContext'
import { periodLabel } from '../lib/format'
import { IconChevL, IconChevR } from './Icons'

export default function MonthPicker() {
  const { period, shiftMonth, setPeriod } = useApp()
  const now = new Date()
  const isNow = period.year === now.getFullYear() && period.month === now.getMonth() + 1

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <div className="month-picker">
        <button onClick={() => shiftMonth(-1)} aria-label="Mes anterior"><IconChevL size={16} /></button>
        <span className="month-picker-label">{periodLabel(period)}</span>
        <button onClick={() => shiftMonth(1)} aria-label="Mes siguiente"><IconChevR size={16} /></button>
      </div>
      {!isNow && (
        <button className="btn btn-ghost btn-sm" onClick={() => setPeriod({ year: now.getFullYear(), month: now.getMonth() + 1 })}>
          Hoy
        </button>
      )}
    </div>
  )
}
