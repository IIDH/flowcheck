import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { openMonth } from '../lib/api'
import { friendlyError, money, parseAmount, periodLabel } from '../lib/format'
import { ACCOUNT_COLORS } from '../lib/palette'
import { supabase } from '../lib/supabase'
import { IconArrow, IconCheck, IconPlus } from './Icons'
import { useQuickAdd } from './QuickAdd'

const PRESETS = [
  { name: 'Arriendo / Dividendo', kind: 'fijo', on: true },
  { name: 'Luz', kind: 'fijo', on: true },
  { name: 'Agua', kind: 'fijo', on: true },
  { name: 'Gas', kind: 'fijo' },
  { name: 'Internet y celular', kind: 'fijo', on: true },
  { name: 'Suscripciones', kind: 'fijo' },
  { name: 'Crédito', kind: 'fijo' },
  { name: 'Supermercado', kind: 'variable', on: true },
  { name: 'Transporte', kind: 'variable', on: true },
  { name: 'Salidas y delivery', kind: 'variable' },
  { name: 'Salud', kind: 'variable' },
  { name: 'Mascotas', kind: 'variable' },
  { name: 'Fondo de emergencia', kind: 'ahorro', on: true },
  { name: 'Inversión', kind: 'ahorro' }
]

// Muestra el monto con separador de miles al salir del campo ("450000" → "450.000")
const pretty = (v) => (parseAmount(v) ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(parseAmount(v)) : '')

const GROUPS = [
  { kind: 'fijo', title: 'Gastos fijos', hint: 'Lo mismo todos los meses' },
  { kind: 'variable', title: 'Gastos variables', hint: 'Cambian mes a mes' },
  { kind: 'ahorro', title: 'Ahorro', hint: 'Lo que quieres apartar' }
]

/** Primer uso: sueldo → en qué gastas → listo. Crea las categorías y el mes. */
export default function Onboarding({ onDone }) {
  const { period, currency, notify, profile } = useApp()
  const openAdd = useQuickAdd()
  const [step, setStep] = useState(0)
  const [salary, setSalary] = useState('')
  const [items, setItems] = useState(() => PRESETS.map((p) => ({ ...p, on: !!p.on, amount: '' })))
  const [custom, setCustom] = useState({ name: '', kind: 'variable' })
  const [busy, setBusy] = useState(false)

  const income = parseAmount(salary)
  const totals = useMemo(() => {
    const t = { fijo: 0, variable: 0, ahorro: 0 }
    for (const it of items) if (it.on) t[it.kind] += parseAmount(it.amount)
    return t
  }, [items])
  const assigned = totals.fijo + totals.variable + totals.ahorro
  const canSpend = income - totals.fijo - totals.ahorro
  const free = income - assigned

  const update = (i, patch) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  function addCustom(e) {
    e.preventDefault()
    const name = custom.name.trim()
    if (!name) return
    if (items.some((it) => it.name.toLowerCase() === name.toLowerCase())) return notify('Ya está en la lista', 'error')
    setItems((list) => [...list, { name, kind: custom.kind, on: true, amount: '' }])
    setCustom({ name: '', kind: custom.kind })
  }

  async function finish() {
    const chosen = items.filter((it) => it.on)
    if (!chosen.length) return notify('Elige al menos una categoría', 'error')
    setBusy(true)
    const rows = chosen.map((it, i) => ({ name: it.name, kind: it.kind, default_amount: parseAmount(it.amount), sort: i, color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }))
    const { error } = await supabase.from('accounts').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true })
    if (error) {
      setBusy(false)
      return notify(friendlyError(error), 'error')
    }
    try {
      await openMonth(period, income)
      setStep(2)
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const name = profile?.full_name?.split(' ')[0]

  return (
    <div className="onboard dc-rise">
      <div className="onboard-steps" aria-label={`Paso ${step + 1} de 3`}>
        {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
      </div>

      {step === 0 && (
        <form
          className="card onboard-card dc-current"
          onSubmit={(e) => {
            e.preventDefault()
            if (!(income > 0)) return notify('Pon tu sueldo (un aproximado sirve)', 'error')
            setStep(1)
          }}
        >
          <span className="label">Paso 1 de 3</span>
          <h1 className="onboard-title">{name ? `Hola ${name}, ` : ''}¿cuánto ganas al mes?</h1>
          <p className="muted">Tu sueldo líquido, lo que te llega. Si varía, pon un promedio.</p>
          <input className="input onboard-money" inputMode="decimal" placeholder="$0" value={salary} onChange={(e) => setSalary(e.target.value)} onBlur={() => setSalary(pretty(salary))} autoFocus aria-label="Sueldo mensual" />
          {income > 0 && <p className="onboard-echo num">{money(income, currency)} al mes</p>}
          <div className="alert alert-info" style={{ marginTop: 14 }}>
            <IconPlus size={18} />
            <div>¿Te llegan abonos, transferencias o bonos aparte? Anótalos cuando lleguen con el botón <b>+</b>: se suman a tu sueldo automáticamente.</div>
          </div>
          <button className="btn dc-cta btn-block" style={{ marginTop: 18, height: 50 }}>Siguiente <IconArrow className="arrow" size={16} /></button>
        </form>
      )}

      {step === 1 && (
        <div className="card onboard-card">
          <span className="label">Paso 2 de 3</span>
          <h1 className="onboard-title">¿En qué se te va la plata?</h1>
          <p className="muted">Marca lo que pagas y pon cuánto, más o menos. Lo puedes cambiar cuando quieras.</p>

          {GROUPS.map((g) => (
            <div key={g.kind} className="onboard-group">
              <div className="group-title"><span className="dc-mono muted">{g.title} · {g.hint}</span></div>
              {items.map((it, i) =>
                it.kind !== g.kind ? null : (
                  <div key={it.name} className={`onboard-item ${it.on ? 'on' : ''}`}>
                    <button type="button" className="onboard-check" onClick={() => update(i, { on: !it.on })} aria-pressed={it.on} aria-label={`${it.on ? 'Quitar' : 'Agregar'} ${it.name}`}>
                      {it.on && <IconCheck size={13} strokeWidth={3} />}
                    </button>
                    <span className="onboard-name" onClick={() => update(i, { on: !it.on })}>{it.name}</span>
                    {it.on && (
                      <input className="input input-sm input-money" inputMode="decimal" placeholder="$0" value={it.amount} onChange={(e) => update(i, { amount: e.target.value })} onBlur={() => update(i, { amount: pretty(it.amount) })} aria-label={`Monto ${it.name}`} />
                    )}
                  </div>
                )
              )}
            </div>
          ))}

          <form className="onboard-custom" onSubmit={addCustom}>
            <input className="input input-sm" placeholder="Otra (ej: Gimnasio)" value={custom.name} maxLength={60} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <select className="input input-sm" value={custom.kind} onChange={(e) => setCustom({ ...custom, kind: e.target.value })} aria-label="Tipo">
              <option value="fijo">Fijo</option>
              <option value="variable">Variable</option>
              <option value="ahorro">Ahorro</option>
            </select>
            <button className="btn btn-ghost btn-sm" disabled={!custom.name.trim()}><IconPlus size={14} /> Agregar</button>
          </form>

          <div className={`onboard-total ${free < 0 ? 'over' : ''}`}>
            <div className="num">
              <span className="muted">Sueldo {money(income, currency)} − asignado {money(assigned, currency)}</span>
              <b>{free >= 0 ? `Te quedan ${money(free, currency)} libres` : `Te pasas por ${money(-free, currency)}`}</b>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Atrás</button>
              <button type="button" className="btn dc-cta" onClick={finish} disabled={busy}>{busy ? 'Creando…' : 'Listo'} <IconArrow className="arrow" size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card onboard-card dc-current" style={{ textAlign: 'center' }}>
          <span className="onboard-done"><IconCheck size={32} strokeWidth={3} /></span>
          <h1 className="onboard-title">¡Listo! Tu presupuesto de {periodLabel(period)} está armado</h1>
          <p className="muted">Después de tus gastos fijos y tu ahorro, tienes</p>
          <div className="onboard-big num">{money(canSpend, currency)}</div>
          <p className="muted">para gastar este mes{totals.variable > 0 ? `: ${money(totals.variable, currency)} en tus gastos variables y ${money(Math.max(free, 0), currency)} libres` : ''}.</p>
          <div className="stack" style={{ gap: 10, marginTop: 22 }}>
            <button className="btn dc-cta btn-block" style={{ height: 50 }} onClick={() => { onDone(); openAdd({ mode: 'gasto' }) }}>Anotar mi primer gasto</button>
            <button className="btn btn-ghost btn-block" onClick={onDone}>Ver mi inicio</button>
          </div>
        </div>
      )}
    </div>
  )
}
