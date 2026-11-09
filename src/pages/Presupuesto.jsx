import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CloseMonthDialog from '../components/CloseMonthDialog'
import { useConfirm } from '../components/ConfirmDialog'
import EmptyMonth from '../components/EmptyMonth'
import ImageBar from '../components/ImageBar'
import MoneyInput from '../components/MoneyInput'
import PageHead from '../components/PageHead'
import { useQuickAdd } from '../components/QuickAdd'
import { IconCheck, IconEdit, IconLock, IconPlus, IconTrash, IconX } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { useAccounts, useMonth } from '../hooks/useMonth'
import { api, todayISO } from '../lib/api'
import { installmentAt, monthFigures } from '../lib/figures'
import { friendlyError, KINDS, money, parseAmount, pct, periodLabel } from '../lib/format'
import { ACCOUNT_COLORS, CHART } from '../lib/palette'
import { supabase } from '../lib/supabase'

const GROUPS = ['fijo', 'variable', 'ahorro']

/** Fecha por defecto para un pago dentro del mes seleccionado. */
function dateInPeriod({ year, month }) {
  const today = todayISO()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return today.startsWith(prefix) ? today : `${prefix}-01`
}

/** Menú "⋯" con las acciones poco frecuentes (y peligrosas) del mes. */
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="more" ref={ref}>
      <button className="dc-icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Más opciones" aria-expanded={open}>
        <span style={{ fontWeight: 800, letterSpacing: 1, marginTop: -6 }}>⋯</span>
      </button>
      {open && (
        <div className="more-menu" role="menu">
          {items.map((it) => (
            <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick() }}>
              {it.icon}
              <span>
                {it.label}
                {it.hint && <small>{it.hint}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Editar una categoría: nombre, tipo, color, vencimiento, saldo inicial; o archivarla. */
function CategoryDialog({ account, actual, onClose, onSaved, onArchive }) {
  const { notify } = useApp()
  const [f, setF] = useState({
    name: account.name,
    kind: account.kind,
    color: account.color,
    due_day: account.due_day ? String(account.due_day) : '',
    opening_balance: account.opening_balance ? String(account.opening_balance) : ''
  })
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    if (!f.name.trim()) return notify('Ponle un nombre', 'error')
    const day = Number.parseInt(f.due_day, 10)
    setBusy(true)
    const { error } = await supabase
      .from('accounts')
      .update({
        name: f.name.trim(),
        kind: f.kind,
        color: f.color,
        due_day: f.kind === 'fijo' && day >= 1 && day <= 31 ? day : null,
        ...(f.kind === 'ahorro' ? { opening_balance: parseAmount(f.opening_balance) } : {})
      })
      .eq('id', account.id)
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    notify('Categoría actualizada')
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={save} role="dialog" aria-modal="true" aria-label={`Editar ${account.name}`}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 className="card-title">Editar categoría</h3>
          <button type="button" className="dc-icon-btn" onClick={onClose} aria-label="Cerrar"><IconX size={16} /></button>
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <label className="field">
            <span className="label">Nombre</span>
            <input className="input" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <div className="field">
            <span className="label">Tipo</span>
            <div className="segmented" role="radiogroup">
              {GROUPS.map((k) => (
                <button type="button" key={k} role="radio" aria-checked={f.kind === k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>
                  {{ fijo: 'Fijo', variable: 'Variable', ahorro: 'Ahorro' }[k]}
                </button>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>{KINDS[f.kind].hint}</span>
          </div>
          {f.kind === 'fijo' && (
            <label className="field">
              <span className="label">Día en que vence (opcional)</span>
              <input className="input" type="number" min={1} max={31} inputMode="numeric" placeholder="Ej: 5" value={f.due_day} onChange={(e) => setF({ ...f, due_day: e.target.value })} />
              <span className="muted" style={{ fontSize: 12 }}>Te avisamos antes si aún no está pagado.</span>
            </label>
          )}
          {f.kind === 'ahorro' && (
            <label className="field">
              <span className="label">¿Cuánto tenías ahorrado aquí antes de usar Flowcheck?</span>
              <input className="input input-money" inputMode="decimal" placeholder="0" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} />
            </label>
          )}
          <div className="field">
            <span className="label">Color</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {ACCOUNT_COLORS.map((col) => (
                <button type="button" key={col} className={`color-pick ${f.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => setF({ ...f, color: col })} aria-label={`Color ${col}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 22, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onArchive}>
            <IconTrash size={14} /> {actual > 0 ? 'Dejar de usar desde el próximo mes' : 'Quitar categoría'}
          </button>
          <button className="btn dc-cta" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}

/** Archivar un ahorro con saldo: ¿se guarda la plata o se saca para usarla este mes? */
function ArchiveSavingsDialog({ account, balance, withdrawBlocked, onClose, onChoose }) {
  const { currency } = useApp()
  const [choice, setChoice] = useState('keep')
  const [busy, setBusy] = useState(false)
  const m = (v) => money(v, currency)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop confirm-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="as-title">
        <h3 id="as-title" className="card-title">¿Dejas de usar "{account.name}"?</h3>
        <p className="confirm-msg">Este ahorro tiene <b>{m(balance)}</b> juntados. ¿Qué hacemos con esa plata?</p>
        <div className="stack" style={{ gap: 10, marginTop: 16 }}>
          <button type="button" className={`choice ${choice === 'keep' ? 'on' : ''}`} onClick={() => setChoice('keep')} aria-pressed={choice === 'keep'}>
            <span className="choice-dot" />
            <span>
              <b>Guardarla</b>
              <small>Dejamos de pedirte un aporte cada mes, pero los {m(balance)} siguen contando en tus ahorros. Los puedes sacar cuando quieras desde Ahorros.</small>
            </span>
          </button>
          <button type="button" className={`choice ${choice === 'withdraw' ? 'on' : ''}`} onClick={() => !withdrawBlocked && setChoice('withdraw')} aria-pressed={choice === 'withdraw'} disabled={Boolean(withdrawBlocked)}>
            <span className="choice-dot" />
            <span>
              <b>Sacarla y usarla este mes</b>
              <small>{withdrawBlocked || <>Se anota un retiro de {m(balance)}: se suma a lo que te queda para gastar y este ahorro queda en $0.</>}</small>
            </span>
          </button>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn dc-cta"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onChoose(choice)
              setBusy(false)
            }}
          >
            {busy ? 'Guardando…' : choice === 'keep' ? 'Guardar y dejar de usar' : `Sacar ${m(balance)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Fila para agregar una categoría nueva al final de un grupo. */
function AddCategory({ kind, onAdd, disabled }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  if (!open) {
    return (
      <button className="add-cat" onClick={() => setOpen(true)} disabled={disabled}>
        <IconPlus size={14} /> Agregar {KINDS[kind].label.toLowerCase()}
      </button>
    )
  }
  return (
    <form
      className="add-cat-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        if (await onAdd({ name: name.trim(), kind, amount: parseAmount(amount) })) {
          setName('')
          setAmount('')
          setOpen(false)
        }
      }}
    >
      <input className="input input-sm" autoFocus maxLength={60} placeholder={{ fijo: 'Ej: Gimnasio', variable: 'Ej: Farmacia', ahorro: 'Ej: Vacaciones' }[kind]} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
      <input className="input input-sm input-money" inputMode="decimal" placeholder="$ al mes" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Monto mensual" />
      <button className="btn btn-sm dc-cta" disabled={!name.trim()}>Agregar</button>
      <button type="button" className="icon-mini" onClick={() => setOpen(false)} aria-label="Cancelar"><IconX size={13} /></button>
    </form>
  )
}

export default function Presupuesto() {
  const { period, currency, theme, notify } = useApp()
  const confirm = useConfirm()
  const openAdd = useQuickAdd()
  const c = CHART[theme]
  const { loading, month, rows, carryIn, reload } = useMonth()
  const { accounts, reload: reloadAccounts } = useAccounts({ includeArchived: true })
  const [incomes, setIncomes] = useState([])
  const [editing, setEditing] = useState(null)
  const [closing, setClosing] = useState(false)
  const [archiving, setArchiving] = useState(null)
  const m = (v) => money(v, currency)

  const loadIncomes = useCallback(async () => {
    if (!month) return setIncomes([])
    const { data } = await supabase
      .from('transactions')
      .select('*, accounts(name, kind, color)')
      .eq('month_id', month.id)
      .order('occurred_on', { ascending: false })
    setIncomes((data ?? []).filter((t) => t.accounts?.kind === 'ingreso'))
  }, [month])
  useEffect(() => { loadIncomes() }, [loadIncomes])
  useEffect(() => {
    window.addEventListener('fa-synced', loadIncomes)
    return () => window.removeEventListener('fa-synced', loadIncomes)
  }, [loadIncomes])

  const refresh = () => {
    reload()
    reloadAccounts()
  }
  const run = async (fn, okMsg) => {
    const { error } = await fn()
    if (error) return notify(friendlyError(error), 'error')
    if (okMsg) notify(okMsg)
    refresh()
    return true
  }

  const accountById = useMemo(() => Object.fromEntries((accounts ?? []).map((a) => [a.id, a])), [accounts])
  const head = <PageHead eyebrow="Presupuesto" title="Tu presupuesto" accent={`de ${periodLabel(period).split(' ')[0]}`} />

  if (loading || accounts === null) return <>{head}<div className="skeleton" style={{ height: 420 }} /></>
  const activeCats = accounts.filter((a) => !a.archived && !a.is_free && a.kind !== 'ingreso')
  if (!month) return <>{head}<EmptyMonth hasAccounts={activeCats.length > 0} onOpened={() => { reload(); reloadAccounts() }} /></>

  const f = monthFigures({ income: month.income, carryIn, rows })
  const closed = month.closed
  // Deudas en cuotas fuera de su rango no se ofrecen para agregar
  const notInPlan = activeCats.filter((a) => !rows.some((r) => r.account_id === a.id) && !['before', 'after'].includes(installmentAt(a, period)))
  const archived = accounts.filter((a) => a.archived && !a.is_free && a.kind !== 'ingreso')

  const segments = [
    { key: 'fijo', label: 'Fijos', value: f.fijo.planned, color: c.fijo },
    { key: 'variable', label: 'Variables', value: f.variable.planned, color: c.variable },
    { key: 'ahorro', label: 'Ahorro', value: f.ahorro.planned, color: c.ahorro },
    { key: 'free', label: 'Libre', value: Math.max(f.unassigned, 0), color: c.free }
  ]

  const setIncome = (n) => run(() => supabase.from('months').update({ income: n }).eq('id', month.id), 'Sueldo actualizado')
  // El monto del mes también queda como monto por defecto para los meses que vienen
  const setPlanned = async (accountId, planned) => {
    const r = await supabase.from('budget_items').upsert({ month_id: month.id, account_id: accountId, planned }, { onConflict: 'month_id,account_id' })
    if (r.error) return notify(friendlyError(r.error), 'error')
    await supabase.from('accounts').update({ default_amount: planned }).eq('id', accountId)
    refresh()
  }
  const removeFromMonth = (r) => run(() => supabase.from('budget_items').delete().eq('month_id', month.id).eq('account_id', r.account_id), `${r.name} quitada de este mes`)
  const addBack = (a) => run(() => supabase.from('budget_items').upsert({ month_id: month.id, account_id: a.id, planned: a.default_amount }, { onConflict: 'month_id,account_id' }), `${a.name} agregada`)
  // Fijos: abre la hoja con el monto que falta, para poder corregirlo si salió más o menos
  const pay = (r) =>
    r.kind === 'fijo' ? openAdd({ mode: 'gasto', accountId: r.account_id, amount: r.planned - r.actual }) : run(
      () => supabase.from('transactions').insert({ month_id: month.id, account_id: r.account_id, amount: r.planned - r.actual, occurred_on: dateInPeriod(period), description: r.kind === 'ahorro' ? 'Ahorro del mes' : 'Pagado' }),
      r.kind === 'ahorro' ? `${r.name}: ahorro anotado` : `${r.name} marcada como pagada`
    )

  async function addCategory({ name, kind, amount }) {
    const created = await supabase
      .from('accounts')
      .insert({ name, kind, default_amount: amount, color: ACCOUNT_COLORS[activeCats.length % ACCOUNT_COLORS.length], sort: activeCats.length })
      .select()
      .single()
    if (created.error) {
      notify(friendlyError(created.error), 'error')
      return false
    }
    return run(() => supabase.from('budget_items').upsert({ month_id: month.id, account_id: created.data.id, planned: amount }, { onConflict: 'month_id,account_id' }), `${name} agregada`)
  }

  async function doArchive(acc, actual, message) {
    const { error } = await supabase.from('accounts').update({ archived: true }).eq('id', acc.id)
    if (error) return notify(friendlyError(error), 'error')
    if (!actual) await supabase.from('budget_items').delete().eq('month_id', month.id).eq('account_id', acc.id)
    setEditing(null)
    setArchiving(null)
    notify(message ?? `${acc.name} quitada`)
    refresh()
  }

  async function archive(acc, actual) {
    // Un ahorro con plata juntada: preguntar qué hacer con el saldo
    if (acc.kind === 'ahorro') {
      const { data } = await supabase.from('account_balances').select('balance').eq('account_id', acc.id).maybeSingle()
      const balance = Number(data?.balance ?? 0)
      if (balance > 0) return setArchiving({ account: acc, actual, balance })
    }
    const ok = await confirm({
      tone: 'warn',
      title: actual > 0 ? `¿Dejar de usar "${acc.name}"?` : `¿Quitar "${acc.name}"?`,
      message: actual > 0 ? 'Este mes ya tiene gastos anotados en ella, así que se queda aquí. Desde el próximo mes no aparecerá. Puedes recuperarla abajo, en "Categorías que ya no usas".' : 'Sale de tu presupuesto. Puedes recuperarla abajo, en "Categorías que ya no usas".',
      confirmText: actual > 0 ? 'Dejar de usar' : 'Quitar'
    })
    if (!ok) return
    doArchive(acc, actual)
  }

  async function archiveSavings(choice) {
    const { account: acc, actual, balance } = archiving
    if (choice === 'keep') return doArchive(acc, actual, `${acc.name} ya no está en tu presupuesto. Sus ${m(balance)} siguen en tus ahorros.`)
    const { error } = await supabase.from('transactions').insert({
      month_id: month.id,
      account_id: acc.id,
      amount: balance,
      occurred_on: dateInPeriod(period),
      kind: 'retiro',
      description: `Cerré el ahorro "${acc.name}" y pasé la plata al mes`
    })
    if (error) return notify(friendlyError(error), 'error')
    return doArchive(acc, actual, `Sacaste ${m(balance)} de ${acc.name}: ya se suman a lo que te queda este mes.`)
  }

  async function restore(acc) {
    await supabase.from('accounts').update({ archived: false }).eq('id', acc.id)
    await addBack(acc)
  }

  async function deleteForever(acc) {
    if (!(await confirm({ tone: 'danger', title: `¿Eliminar "${acc.name}" para siempre?`, message: 'Si tiene gastos anotados no se puede eliminar; en ese caso déjala como está.', confirmText: 'Eliminar' }))) return
    run(() => supabase.from('accounts').delete().eq('id', acc.id), 'Categoría eliminada')
  }

  async function removeIncome(t) {
    if (!(await confirm({ tone: 'danger', title: '¿Borrar este ingreso?', message: <><b>{t.accounts?.name}</b> · {m(t.amount)}{t.description ? ` · ${t.description}` : ''}</>, confirmText: 'Borrar' }))) return
    const { error } = await supabase.from('transactions').delete().eq('id', t.id)
    if (error) return notify(friendlyError(error), 'error')
    notify('Ingreso borrado')
    loadIncomes()
    reload()
  }

  async function deleteMonth() {
    const ok = await confirm({
      tone: 'danger',
      title: `¿Borrar el presupuesto de ${periodLabel(period)}?`,
      message: <>Se borran el sueldo, los montos y <b>todo lo anotado</b> en ese mes. Tus categorías no se tocan.<br /><br />No se puede deshacer.</>,
      confirmText: 'Borrar mes'
    })
    if (!ok) return
    const { error } = await supabase.from('months').delete().eq('id', month.id)
    if (error) return notify(friendlyError(error), 'error')
    notify(`Presupuesto de ${periodLabel(period)} borrado`)
    reload()
  }

  async function toggleClosed() {
    if (!closed) return setClosing(true)
    if (!(await confirm({ title: `¿Reabrir ${periodLabel(period)}?`, message: 'Lo que había pasado al mes siguiente se anula (también la deuda en cuotas, si la creaste al cerrar). Al volver a cerrar se recalcula.', confirmText: 'Reabrir mes' }))) return
    try {
      const r = await api('/months/close', { method: 'POST', body: { ...period, reopen: true } })
      notify(r.debtKept ? 'Mes reabierto. La deuda en cuotas ya tenía pagos: quedó archivada.' : r.debtRemoved ? 'Mes reabierto · se quitó la deuda en cuotas' : 'Mes reabierto')
      reload()
    } catch (err) {
      notify(friendlyError(err), 'error')
    }
  }

  const menu = [
    closed
      ? { label: 'Reabrir mes', hint: 'Para volver a editarlo', icon: <IconLock size={16} />, onClick: toggleClosed }
      : { label: 'Cerrar mes', hint: 'Lo que sobró pasa al próximo mes o a un ahorro', icon: <IconLock size={16} />, onClick: toggleClosed },
    ...(closed ? [] : [{ label: 'Borrar este mes', hint: 'Elimina todo lo anotado', icon: <IconTrash size={16} />, danger: true, onClick: deleteMonth }])
  ]

  return (
    <>
      <PageHead eyebrow="Presupuesto" title="Tu presupuesto" accent={`de ${periodLabel(period).split(' ')[0]}`}>
        <MoreMenu items={menu} />
      </PageHead>
      {closed && <div className="alert alert-info" style={{ marginBottom: 18 }}><IconLock size={18} /><div>Este mes está cerrado (solo lectura). Para editarlo, ábrelo desde el menú ⋯.</div></div>}
      <div className="stack dc-rise">
        <div className="grid grid-main">
          <section className="card">
            <div className="card-head" style={{ marginBottom: 12 }}>
              <div>
                <h3 className="card-title">Lo que entra este mes</h3>
                <p className="card-sub">Tu sueldo más los abonos, transferencias o bonos que te lleguen.</p>
              </div>
            </div>
            <div className="income-grid">
              <label className="field">
                <span className="label">Sueldo</span>
                <MoneyInput value={Number(month.income)} onCommit={setIncome} disabled={closed} aria-label="Sueldo del mes" style={{ fontSize: 20, height: 50, fontFamily: 'var(--font-display)', fontWeight: 600 }} />
              </label>
              <div className="income-total">
                <span className="label">Total del mes</span>
                <b className="num">{m(f.totalIncome)}</b>
              </div>
            </div>

            <div className="group-title" style={{ marginTop: 18 }}>
              <span className="dc-mono muted">Otros ingresos · {m(f.extra)}</span>
              {!closed && <button className="btn btn-ghost btn-sm" onClick={() => openAdd({ mode: 'ingreso' })}><IconPlus size={14} /> Agregar</button>}
            </div>
            {incomes.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>¿Te llegó un abono o transferencia? Agrégalo y se suma a tu sueldo.</p>
            ) : (
              <div className="list">
                {incomes.map((t) => (
                  <div key={t.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
                    <div style={{ minWidth: 0 }}>
                      <b>{t.accounts?.name}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{new Date(`${t.occurred_on}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })}{t.description ? ` · ${t.description}` : ''}</div>
                    </div>
                    <b className="num" style={{ color: 'var(--ok)' }}>+{m(t.amount)}</b>
                    {!closed ? <button className="icon-mini" onClick={() => removeIncome(t)} aria-label="Borrar ingreso"><IconTrash size={13} /></button> : <span />}
                  </div>
                ))}
              </div>
            )}
            {(f.carryIn !== 0 || f.withdrawn > 0) && (
              <div className="list" style={{ marginTop: 8 }}>
                {f.carryIn !== 0 && <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}><span className="muted">Del mes anterior</span><b className="num" style={{ color: f.carryIn < 0 ? 'var(--danger)' : 'var(--ok)' }}>{f.carryIn > 0 ? '+' : '−'}{m(Math.abs(f.carryIn))}</b></div>}
                {f.withdrawn > 0 && <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}><span className="muted">Sacado de ahorros</span><b className="num" style={{ color: 'var(--ok)' }}>+{m(f.withdrawn)}</b></div>}
              </div>
            )}
          </section>

          <section className="card">
            <h3 className="card-title">Cómo lo repartes</h3>
            <p className="card-sub" style={{ marginBottom: 16 }}>De {m(f.totalIncome)} que entran este mes</p>
            <ImageBar segments={segments} total={f.totalIncome} currency={currency} />
            <div className={`alert ${f.unassigned >= 0 ? 'alert-ok' : 'alert-danger'}`} style={{ marginTop: 16 }}>
              {f.unassigned >= 0 ? <IconCheck size={18} /> : <IconX size={18} />}
              <div>
                {f.unassigned >= 0
                  ? <>Te quedan <b>{m(f.unassigned)}</b> libres sin asignar ({pct(f.totalIncome > 0 ? f.unassigned / f.totalIncome : 0)}). Puedes gastarlos en lo que quieras o asignarlos a una categoría.</>
                  : <>Estás repartiendo <b>{m(-f.unassigned)}</b> más de lo que entra. Baja algún monto o anota tus otros ingresos.</>}
              </div>
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Categorías</h3>
              <p className="card-sub">Cambia un monto y se guarda solo. Los próximos meses parten con estos montos.</p>
            </div>
          </div>
          <fieldset disabled={closed} style={{ border: 0, padding: 0, margin: 0 }}>
            {GROUPS.map((kind) => {
              const list = rows.filter((r) => r.kind === kind && !r.is_free).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
              const g = f[kind]
              return (
                <div key={kind} className="cat-group">
                  <div className="group-title">
                    <span className="dc-mono muted row" style={{ gap: 8 }}><span className="swatch" style={{ background: c[kind] }} />{KINDS[kind].plural}</span>
                    <span className="dc-mono muted num">{m(g.planned)}</span>
                  </div>
                  <div className="list">
                    {list.map((r) => {
                      const acc = accountById[r.account_id]
                      const done = r.planned > 0 && r.actual >= r.planned
                      const over = kind !== 'ahorro' && r.actual > r.planned
                      return (
                        <div key={r.account_id} className="list-row budget-row">
                          <button type="button" className="budget-name" onClick={() => acc && setEditing({ account: acc, actual: r.actual })} title="Editar categoría">
                            <span className="swatch" style={{ background: r.color }} />
                            <span className="budget-label">{r.name}</span>
                            <IconEdit size={12} className="budget-edit" />
                          </button>
                          <div className="budget-badges">
                            {kind === 'fijo' && typeof installmentAt(acc, period) === 'object' && installmentAt(acc, period) && <span className="badge badge-warn">Cuota {installmentAt(acc, period).n} de {installmentAt(acc, period).of}</span>}
                            {kind === 'fijo' && acc?.due_day && !done && <span className="badge">día {acc.due_day}</span>}
                            {done && <span className="badge badge-ok"><IconCheck size={11} /> {kind === 'ahorro' ? 'Meta' : 'Pagado'}</span>}
                            {over && <span className="badge badge-danger">+{m(r.actual - r.planned)}</span>}
                            {!done && !over && r.actual > 0 && <span className="muted num" style={{ fontSize: 12 }}>{m(r.actual)} usado</span>}
                          </div>
                          <MoneyInput value={r.planned} onCommit={(n) => setPlanned(r.account_id, n)} className="input-sm" aria-label={`Monto ${r.name}`} />
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            {(kind === 'fijo' || kind === 'ahorro') && r.planned > r.actual ? (
                              <button className="pay-btn" onClick={() => pay(r)} title={kind === 'ahorro' ? 'Anotar el ahorro del mes' : 'Marcar como pagado'}>
                                <IconCheck size={13} /> {kind === 'ahorro' ? 'Ahorré' : 'Pagué'}
                              </button>
                            ) : r.actual === 0 ? (
                              <button className="icon-mini" onClick={() => removeFromMonth(r)} title="Quitar de este mes" aria-label={`Quitar ${r.name} de este mes`}><IconX size={13} /></button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <AddCategory kind={kind} onAdd={addCategory} disabled={closed} />
                </div>
              )
            })}
          </fieldset>

          {!closed && notInPlan.length > 0 && (
            <div className="readd">
              <span className="label">No están este mes</span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {notInPlan.map((a) => <button key={a.id} className="chip" onClick={() => addBack(a)}><IconPlus size={12} /> {a.name}</button>)}
              </div>
            </div>
          )}

          {archived.length > 0 && (
            <details className="archived">
              <summary className="muted">Categorías que ya no usas ({archived.length})</summary>
              <div className="list" style={{ marginTop: 8 }}>
                {archived.map((a) => (
                  <div key={a.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                    <span className="muted">{a.name} · {KINDS[a.kind].label}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => restore(a)}>Recuperar</button>
                      <button className="icon-mini danger" onClick={() => deleteForever(a)} aria-label={`Eliminar ${a.name}`}><IconTrash size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      </div>

      {editing && (
        <CategoryDialog
          account={editing.account}
          actual={editing.actual}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
          onArchive={() => archive(editing.account, editing.actual)}
        />
      )}
      {archiving && (
        <ArchiveSavingsDialog
          account={archiving.account}
          balance={archiving.balance}
          withdrawBlocked={
            closed
              ? 'Este mes está cerrado. Reábrelo para poder sacar la plata, o elige guardarla.'
              : `${period.year}-${String(period.month).padStart(2, '0')}` > todayISO().slice(0, 7)
                ? 'Para sacar la plata ve al mes actual: no se puede anotar un retiro en un mes que aún no llega.'
                : null
          }
          onClose={() => setArchiving(null)}
          onChoose={archiveSavings}
        />
      )}
      {closing && (
        <CloseMonthDialog
          available={Math.round((f.totalIncome - f.spent - f.saved) * 100) / 100}
          savingsAccounts={accounts.filter((a) => a.kind === 'ahorro' && !a.archived)}
          onClose={() => setClosing(false)}
          onDone={() => { setClosing(false); refresh() }}
        />
      )}
    </>
  )
}
