import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { openMonth, todayISO } from '../lib/api'
import { ensureFreeAccount, FREE_COLOR, FREE_LABEL, FREE_NAME } from '../lib/freeBalance'
import { applyMove } from '../lib/budgetMoves'
import { monthFigures } from '../lib/figures'
import { friendlyError, money, parseAmount } from '../lib/format'
import { enqueue, isNetworkError } from '../lib/offline'
import { supabase } from '../lib/supabase'
import { IconArrow, IconCheck, IconX } from './Icons'

const Ctx = createContext(() => {})
export const useQuickAdd = () => useContext(Ctx)

const FREE = '__free__'
const INCOME_PRESETS = ['Transferencia', 'Abono', 'Bono', 'Venta']
const INCOME_COLOR = '#1baf7a'
const MODES = {
  gasto: { label: 'Gasto', cta: 'Anotar gasto', title: '¿Cuánto gastaste?' },
  ingreso: { label: 'Ingreso', cta: 'Anotar ingreso', title: '¿Cuánto te llegó?' },
  ahorro: { label: 'Ahorro', cta: 'Anotar ahorro', title: '¿Cuánto apartaste?' }
}
const pad = (n) => String(n).padStart(2, '0')
// En celulares el teclado se abre recién cuando el usuario toca el monto
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
// Separador de miles mientras se escribe ("32500" → "32.500"); la coma queda para decimales
const typing = (v) => {
  const [int, dec] = String(v).replace(/[^\d,]/g, '').split(',')
  const grouped = (int || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return dec !== undefined ? `${grouped},${dec.slice(0, 2)}` : grouped
}

/** Proveedor del botón "+": abre la hoja para anotar desde cualquier pantalla. */
export function QuickAddProvider({ children }) {
  const [state, setState] = useState(null)
  const open = useCallback((opts = {}) => setState({ mode: 'gasto', ...opts }), [])
  return (
    <Ctx.Provider value={open}>
      {children}
      {state && <QuickAddSheet {...state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  )
}

function QuickAddSheet({ mode: initialMode, accountId: initialAccount, amount: initialAmount, onClose }) {
  const { period, currency, notify } = useApp()
  const [mode, setMode] = useState(initialMode)
  const [accounts, setAccounts] = useState(null)
  const [accountId, setAccountId] = useState(initialAccount ?? '')
  const [amount, setAmount] = useState(initialAmount > 0 ? typing(String(initialAmount).replace('.', ',')) : '')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState({})
  const [search, setSearch] = useState('')
  const [added, setAdded] = useState([])
  const amountRef = useRef(null)
  const scrollRef = useRef(null)
  // Cifras del mes para mostrar cuánto queda en cada categoría y en la plata libre
  const [fig, setFig] = useState(null)
  // Gasto fijo distinto a lo presupuestado: de dónde sale lo que te pasaste / adónde va lo que sobró
  const [cover, setCover] = useState(FREE)
  const [settled, setSettled] = useState(false)
  const [spare, setSpare] = useState(FREE)

  const first = `${period.year}-${pad(period.month)}-01`
  const last = `${period.year}-${pad(period.month)}-${pad(new Date(period.year, period.month, 0).getDate())}`
  const [date, setDate] = useState(todayISO() >= first && todayISO() <= last ? todayISO() : first)

  useEffect(() => {
    supabase
      .from('accounts')
      .select('*')
      .eq('archived', false)
      .order('sort')
      .order('name')
      .then(({ data }) => setAccounts(data ?? []))
    // Lo más usado primero: cuenta los últimos movimientos por categoría
    supabase
      .from('transactions')
      .select('account_id')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const counts = {}
        for (const t of data ?? []) counts[t.account_id] = (counts[t.account_id] || 0) + 1
        setUsage(counts)
      })
  }, [])

  const loadFigures = useCallback(async () => {
    const m = await supabase.from('months').select('*').eq('year', period.year).eq('month', period.month).maybeSingle()
    if (!m.data) return setFig(null)
    const [r, prev] = await Promise.all([
      supabase.from('month_account_summary').select('*').eq('month_id', m.data.id),
      supabase
        .from('months')
        .select('*')
        .or(`year.lt.${period.year},and(year.eq.${period.year},month.lt.${period.month})`)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])
    const rows = (r.data ?? []).map((x) => ({ ...x, planned: Number(x.planned), actual: Number(x.actual), withdrawn: Number(x.withdrawn ?? 0) }))
    const left = Object.fromEntries(rows.map((x) => [x.account_id, x.planned - x.actual]))
    const carryIn = prev.data?.closed ? Number(prev.data.carry_out ?? 0) : 0
    setFig({ ...monthFigures({ income: m.data.income, carryIn, rows }), left, rows, monthId: m.data.id })
  }, [period.year, period.month])
  useEffect(() => { loadFigures() }, [loadFigures])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Opciones según el tipo: gastos (variables primero), ingresos o ahorros
  const options = useMemo(() => {
    const list = (accounts ?? []).filter((a) => !a.is_free)
    const uses = (a) => usage[a.id] || 0
    const byUse = (a, b) => uses(b) - uses(a)
    if (mode === 'gasto') {
      // Variables antes que fijos y, dentro de cada grupo, lo que más anotas primero
      return [
        ...list.filter((a) => a.kind === 'variable').sort(byUse),
        ...list.filter((a) => a.kind === 'fijo').sort(byUse),
        { id: FREE, name: FREE_LABEL, kind: 'free', color: FREE_COLOR, hint: 'Lo que no asignaste a ninguna categoría' }
      ]
    }
    if (mode === 'ingreso') {
      const own = list.filter((a) => a.kind === 'ingreso')
      const presets = INCOME_PRESETS.filter((p) => !own.some((a) => a.name.toLowerCase() === p.toLowerCase())).map((p) => ({ id: `new:${p}`, name: p, color: INCOME_COLOR }))
      return [...own, ...presets]
    }
    return list.filter((a) => a.kind === 'ahorro').sort(byUse)
  }, [accounts, mode, usage])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
  }, [options, search])

  // Al cambiar de tipo, preselecciona la primera opción que tenga sentido
  useEffect(() => {
    if (!accounts) return
    if (options.some((o) => o.id === accountId)) return
    setAccountId(mode === 'gasto' ? '' : (options[0]?.id ?? ''))
  }, [mode, options, accounts, accountId])

  useEffect(() => {
    if (!isTouch()) amountRef.current?.focus()
  }, [mode])

  // Qué le pasa a "Te quedan para gastar" con lo elegido
  function pickHint() {
    const value = parseAmount(amount)
    if (accountId === FREE) {
      if (!fig) return 'Sale de tu plata libre: lo que no asignaste a ninguna categoría.'
      const after = fig.free - value
      return after >= 0 ? `Sale de tu plata libre. Te quedarían ${money(after, currency)} libres.` : `Sale de tu plata libre y te pasas por ${money(-after, currency)}.`
    }
    const acc = accounts?.find((a) => a.id === accountId)
    if (!acc) return ''
    const left = fig?.left?.[acc.id]
    if (acc.kind === 'fijo') {
      return left != null && value > left
        ? `Gasto fijo: ya estaba reservado, pero te pasas por ${money(value - Math.max(left, 0), currency)} y eso sí baja lo que te queda.`
        : 'Gasto fijo: ya estaba reservado en tu presupuesto, así que no cambia lo que te queda para gastar.'
    }
    if (left == null) return 'Baja lo que te queda para gastar.'
    const after = left - value
    return after >= 0 ? `Baja lo que te queda para gastar. En ${acc.name} te quedarían ${money(after, currency)}.` : `Baja lo que te queda para gastar y te pasas por ${money(-after, currency)} en ${acc.name}.`
  }

  const m = (v) => money(v, currency)
  const picked = mode === 'gasto' ? accounts?.find((a) => a.id === accountId) : null
  const value = parseAmount(amount)
  const fixedLeft = picked?.kind === 'fijo' && fig?.left?.[picked.id] != null ? fig.left[picked.id] : null
  // Te pasas: lo que excede lo que faltaba pagar. Sobra: pagaste menos de lo que faltaba.
  const overBy = fixedLeft != null && value > 0 ? Math.max(value - Math.max(fixedLeft, 0), 0) : 0
  const spareBy = fixedLeft != null && value > 0 && value < fixedLeft ? fixedLeft - value : 0
  const otherCats = (fig?.rows ?? [])
    .filter((r) => r.account_id !== picked?.id && !r.is_free && ['fijo', 'variable', 'ahorro'].includes(r.kind))
    .map((r) => ({ ...r, left: r.planned - r.actual }))
  const coverOptions = otherCats.filter((r) => r.left >= overBy && r.left > 0)
  const catName = (id) => (id === FREE ? FREE_LABEL : otherCats.find((r) => r.account_id === id)?.name ?? '')
  useEffect(() => {
    setCover(FREE)
    setSettled(false)
    setSpare(FREE)
  }, [accountId])

  const chip = (id, name, color, sub, on, pick) => (
    <button type="button" key={id} className={`cat-chip ${on ? 'on' : ''} ${id === FREE ? 'free' : ''}`} onClick={() => pick(id)}>
      <span className="swatch" style={{ background: color }} />
      {name}
      {sub && <small className="num">{sub}</small>}
    </button>
  )
  const KIND_WORD = { fijo: 'fijo', variable: 'variable', ahorro: 'ahorro' }

  const hasCategories = (accounts ?? []).some((a) => !a.is_free && a.kind !== 'ingreso')

  async function resolveMonth(iso) {
    const [y, m] = iso.split('-').map(Number)
    const found = await supabase.from('months').select('*').eq('year', y).eq('month', m).maybeSingle()
    if (found.error) throw found.error
    if (found.data) return found.data
    const r = await openMonth({ year: y, month: m })
    return r.month
  }

  async function resolveAccount() {
    if (accountId === FREE) return { id: await ensureFreeAccount(accounts), name: FREE_NAME, kind: 'variable', color: FREE_COLOR }
    if (accountId.startsWith('new:')) {
      const name = accountId.slice(4)
      const created = await supabase.from('accounts').insert({ name, kind: 'ingreso', color: INCOME_COLOR, sort: 900 }).select().single()
      if (created.error) throw created.error
      return created.data
    }
    return accounts.find((a) => a.id === accountId)
  }

  async function submit(e) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (!(value > 0)) return notify('Ingresa un monto mayor a 0', 'error')
    if (!accountId) return notify(mode === 'gasto' ? '¿En qué lo gastaste? Elige una categoría' : 'Elige de dónde viene', 'error')
    if (!date) return notify('Elige la fecha', 'error')
    setBusy(true)
    try {
      const month = await resolveMonth(date)
      if (month.closed) throw new Error('Ese mes está cerrado. Reábrelo en Presupuesto para anotar.')
      const acc = await resolveAccount()
      const row = { id: crypto.randomUUID(), month_id: month.id, account_id: acc.id, amount: value, occurred_on: date, description: description.trim() || null }
      const { error } = await supabase.from('transactions').insert(row)
      const queued = !!error
      if (error) {
        if (!isNetworkError(error)) throw error
        enqueue({ ...row, accounts: { name: acc.name, kind: acc.kind, color: acc.color } })
        notify('Sin conexión: quedó guardado en el teléfono y se sincroniza al volver la red')
      }
      // Mueve el presupuesto del mes según lo que respondió (solo este mes)
      let note = acc.kind === 'fijo' ? ' · gasto fijo, ya estaba reservado' : ''
      if (fig && fig.monthId === month.id && (overBy > 0 || (spareBy > 0 && settled))) {
        const plan = Object.fromEntries(fig.rows.map((r) => [r.account_id, r.planned]))
        const over = overBy > 0
        const other = over ? cover : spare
        const moved = await applyMove({
          plan,
          month_id: month.id,
          transaction_id: queued ? null : row.id,
          account_id: acc.id,
          other_account_id: other === FREE ? null : other,
          reason: over ? 'exceso' : 'sobrante',
          amount: over ? overBy : spareBy,
          occurred_on: date
        })
        note = over ? ` · ${m(overBy)} extra salió de ${catName(other)}` : ` · sobraron ${m(spareBy)}, pasaron a ${catName(other)}`
        if (moved.error) {
          note = ''
          notify(`El gasto quedó anotado, pero no se pudo mover el presupuesto: ${friendlyError(moved.error)}`, 'error')
        } else if (moved.logError) {
          notify('Presupuesto ajustado. Falta activar el historial de ajustes en la base (migración 0008).', 'error')
        }
      }
      window.dispatchEvent(new CustomEvent('fa-synced'))
      // La hoja queda abierta para el siguiente: la franja verde confirma y "Listo" la cierra
      setAdded((list) => [...list, { id: row.id, name: accountId === FREE ? FREE_LABEL : acc.name, amount: value, plus: mode === 'ingreso', note }])
      loadFigures()
      setAmount('')
      setDescription('')
      setSearch('')
      if (mode === 'gasto') setAccountId('')
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      if (!isTouch()) amountRef.current?.focus()
    } catch (err) {
      notify(isNetworkError(err) ? 'Sin conexión: necesitas internet para el primer movimiento del mes' : friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const addedTotal = added.reduce((t, x) => t + x.amount, 0)

  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <form className="sheet card" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label={MODES[mode].cta}>
        <div className="sheet-head">
          <div className="sheet-grip" aria-hidden="true" />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="segmented sheet-modes" role="tablist">
              {Object.entries(MODES).map(([k, v]) => (
                <button type="button" key={k} role="tab" aria-selected={mode === k} className={`${mode === k ? 'on' : ''} m-${k}`} onClick={() => { setMode(k); setSearch('') }}>{v.label}</button>
              ))}
            </div>
            {added.length > 0 ? (
              <button type="button" className="btn btn-sm sheet-done" onClick={onClose}>Listo</button>
            ) : (
              <button type="button" className="dc-icon-btn" onClick={onClose} aria-label="Cerrar"><IconX size={16} /></button>
            )}
          </div>
          {added.length > 0 && (
            <div className="sheet-added" role="status">
              <IconCheck size={14} />
              <span>
                {added.length === 1 ? '1 anotado' : `${added.length} anotados`} · {money(addedTotal, currency)}
                <small>Último: {added.at(-1).name} {added.at(-1).plus ? '+' : ''}{money(added.at(-1).amount, currency)}{added.at(-1).note}</small>
              </span>
            </div>
          )}
        </div>

        {accounts !== null && !hasCategories && mode !== 'ingreso' ? (
          <div className="empty" style={{ padding: '28px 8px' }}>
            <h3>Primero arma tu presupuesto</h3>
            <p className="muted" style={{ margin: '8px 0 18px' }}>Toma un minuto: tu sueldo y en qué gastas.</p>
            <Link to="/" className="btn dc-cta" onClick={onClose}>Empezar <IconArrow className="arrow" size={16} /></Link>
          </div>
        ) : (
          <>
            <div className={`sheet-body ${busy ? 'is-busy' : ''}`} ref={scrollRef} aria-busy={busy}>
              <label className="sheet-amount">
                <span className="label">{MODES[mode].title}</span>
                <input
                  ref={amountRef}
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder="$0"
                  value={amount}
                  onChange={(e) => setAmount(typing(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    e.currentTarget.blur()
                  }}
                  aria-label="Monto"
                />
              </label>

              <div className="field">
                <span className="label">{mode === 'gasto' ? '¿En qué?' : mode === 'ingreso' ? '¿Qué es?' : '¿Dónde lo apartas?'}</span>
                {options.length > 10 && (
                  <input className="input input-sm" type="search" placeholder="Buscar categoría" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar categoría" />
                )}
                {accounts === null ? (
                  <div className="skeleton" style={{ height: 40 }} />
                ) : options.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13 }}>No tienes categorías de ahorro. Créala en <Link to="/presupuesto" onClick={onClose} className="legal-link">Presupuesto</Link>.</p>
                ) : (
                  <>
                    {(mode === 'gasto' && !search.trim()
                      ? [
                          { key: 'variable', title: 'Variables · bajan lo que te queda', items: shown.filter((o) => o.kind === 'variable') },
                          { key: 'fijo', title: 'Fijos · ya están reservados', items: shown.filter((o) => o.kind === 'fijo') },
                          { key: 'free', title: 'Sin categoría', items: shown.filter((o) => o.kind === 'free') }
                        ]
                      : [{ key: 'all', items: shown }]
                    )
                      .filter((g) => g.items.length)
                      .map((g) => (
                        <div key={g.key} className="chip-group">
                          {g.title && <span className="chip-group-title">{g.title}</span>}
                          <div className="cat-chips">
                            {g.items.map((o) => (
                              <button type="button" key={o.id} className={`cat-chip ${accountId === o.id ? 'on' : ''} ${o.kind === 'free' ? 'free' : ''}`} onClick={() => setAccountId(o.id)} title={o.hint}>
                                <span className="swatch" style={{ background: o.color }} />
                                {o.name}
                                {o.kind === 'free' && fig && <small className="num">quedan {money(Math.max(fig.free, 0), currency)}</small>}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    {shown.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Ninguna categoría coincide.</span>}
                    {mode === 'gasto' && accountId && !overBy && !spareBy && <p className="pick-hint">{pickHint()}</p>}
                    {overBy > 0 && (
                      <div className="follow-up">
                        <p className="follow-q">Te pasas por <b className="num">{m(overBy)}</b> en {picked.name}. ¿De dónde sacas esa diferencia?</p>
                        <div className="cat-chips">
                          {chip(FREE, FREE_LABEL, FREE_COLOR, fig && `quedan ${m(Math.max(fig.free, 0))}`, cover === FREE, setCover)}
                          {coverOptions.map((r) => chip(r.account_id, r.name, r.color, `quedan ${m(r.left)}`, cover === r.account_id, setCover))}
                        </div>
                        <p className="follow-note">
                          {cover === FREE
                            ? 'Sale de tu plata libre: baja lo que te queda para gastar.'
                            : `Le quitamos ${m(overBy)} al presupuesto de ${catName(cover)} (${KIND_WORD[otherCats.find((r) => r.account_id === cover)?.kind]}) este mes.`}
                          {coverOptions.length === 0 && ' Ninguna otra categoría tiene saldo suficiente para cubrirlo.'}
                        </p>
                      </div>
                    )}
                    {spareBy > 0 && (
                      <div className="follow-up">
                        <p className="follow-q">Te faltarían <b className="num">{m(spareBy)}</b> para completar {picked.name}. ¿Con esto ya quedó pagado este mes?</p>
                        <div className="follow-choice">
                          <button type="button" className={`choice ${!settled ? 'on' : ''}`} onClick={() => setSettled(false)}>
                            <span className="choice-dot" /><span><b>No, falta pagar</b><small>Los {m(spareBy)} siguen reservados.</small></span>
                          </button>
                          <button type="button" className={`choice ${settled ? 'on' : ''}`} onClick={() => setSettled(true)}>
                            <span className="choice-dot" /><span><b>Sí, salió menos</b><small>Hubo descuento o vino más barato.</small></span>
                          </button>
                        </div>
                        {settled && (
                          <>
                            <p className="follow-q">¿Dónde dejas los <b className="num">{m(spareBy)}</b> que sobraron?</p>
                            <div className="cat-chips">
                              {chip(FREE, FREE_LABEL, FREE_COLOR, fig && `quedan ${m(Math.max(fig.free, 0))}`, spare === FREE, setSpare)}
                              {otherCats.map((r) => chip(r.account_id, r.name, r.color, null, spare === r.account_id, setSpare))}
                            </div>
                            <p className="follow-note">
                              {spare === FREE
                                ? 'Vuelven a tu plata libre: sube lo que te queda para gastar.'
                                : `Se suman al presupuesto de ${catName(spare)} este mes.`}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
                {mode === 'ingreso' && <span className="muted" style={{ fontSize: 12 }}>Se suma a tu sueldo y aumenta lo que te queda para gastar este mes.</span>}
              </div>

              <div className="sheet-extra">
                <label className="field">
                  <span className="label">Fecha</span>
                  <input type="date" className="input input-sm" min={first} max={last} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="field">
                  <span className="label">Detalle</span>
                  <input className="input input-sm" maxLength={140} placeholder="Opcional" value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="sheet-foot">
              <button className={`btn dc-cta btn-block sheet-cta m-${mode}`} disabled={busy}>{busy ? 'Guardando…' : MODES[mode].cta}</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
